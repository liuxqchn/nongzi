/**
 * 站点后端（Cloudflare Pages Function，挂在 /api/* 下）。
 *
 * 为什么需要它：飞书开放平台不返回 CORS 头，浏览器里的 H5 无法直接调多维表格接口；
 * 附件图片的下载地址还要带 Authorization，<img src> 也发不出去。所以由这个同源接口代劳，
 * app_secret 只存在 Cloudflare 环境变量里，不会打进前端产物。
 *
 * 环境变量说明见 _lib/feishu.js 顶部。
 *
 * 路由：
 *   GET /api/products           取当前表格内容（最多缓存 FEISHU_CACHE_TTL 秒，默认 30）
 *   GET /api/products?fresh=1   跳过缓存，用于「重新加载商品」
 *   GET /api/media?file=<token> 附件图片（表格图片列），带长期边缘缓存
 */

import {
  JSON_HEADERS,
  collectMediaTokens,
  domain,
  fetchRecords,
  getTenantToken,
  json,
  publicItems,
  requireEnv,
} from '../_lib/feishu.js'

// 图片字节在实例内存里存一份。Cache API 在某些部署形态下不生效/跨实例不复用，
// 同一实例短时间内重复请求就不用再跑一趟飞书。上限约 12MB，大图不进内存。
const MEDIA_MEMORY_LIMIT = 12 * 1024 * 1024
const MEDIA_MEMORY_ENTRY_LIMIT = 2 * 1024 * 1024
let mediaMemorySize = 0
const mediaMemory = new Map()

function rememberMedia(file, entry) {
  if (mediaMemory.has(file)) return
  if (entry.body.byteLength > MEDIA_MEMORY_ENTRY_LIMIT) return
  if (mediaMemorySize + entry.body.byteLength > MEDIA_MEMORY_LIMIT) return
  mediaMemory.set(file, entry)
  mediaMemorySize += entry.body.byteLength
}

async function handleProducts({ request, env }) {
  const missing = requireEnv(env)
  if (missing.length) {
    return json({ error: `服务端还没配置 ${missing.join('、')}`, items: [] }, 503)
  }

  const fresh = new URL(request.url).searchParams.get('fresh') === '1'

  try {
    const { items } = await fetchRecords(env, { fresh })
    // 只把「对外可见」的列发出去：成本/进价/备注这类内部列在这里被丢掉，
    // 顾客按 F12 也看不到（见 _lib/feishu.js 的 hiddenFieldTest）。
    return new Response(JSON.stringify({ items: publicItems(items, env) }), {
      headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return json({ error: e.message || '读取多维表格失败', items: [] }, 502)
  }
}

/**
 * 附件图片代理。
 * 多维表格附件要用 drive/v1/medias/{file_token}/download 下载，并且必须带
 * extra={"bitablePerm":{"tableId":"tbl…","rev":0}}，否则返回 403。
 */
async function handleMedia({ request, env, waitUntil }) {
  const url = new URL(request.url)
  const file = url.searchParams.get('file') || ''
  if (!/^[A-Za-z0-9_-]{6,120}$/.test(file)) {
    return json({ error: '缺少或非法的 file 参数' }, 400)
  }

  // 三层缓存：实例内存 → Cache API（按真实请求地址做 key）→ 飞书
  const memoryHit = mediaMemory.get(file)
  if (memoryHit) {
    return new Response(memoryHit.body, {
      headers: {
        'Content-Type': memoryHit.type,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  const cache = typeof caches !== 'undefined' ? caches.default : null
  const cacheKey = new Request(url.toString(), { method: 'GET' })
  if (cache) {
    const hit = await cache.match(cacheKey)
    if (hit) return hit
  }

  try {
    const { items } = await fetchRecords(env)
    // 只放行表格里真实存在的附件，挡住拿接口当任意文件下载器的用法
    if (!collectMediaTokens(items, env).has(file)) {
      return json({ error: '附件不存在' }, 404)
    }

    const token = await getTenantToken(env)
    const extra = JSON.stringify({
      bitablePerm: { tableId: env.FEISHU_TABLE_ID, rev: Number(env.FEISHU_REV || 0) },
    })
    const target = `${domain(env)}/open-apis/drive/v1/medias/${encodeURIComponent(file)}/download?extra=${encodeURIComponent(extra)}`

    const upstream = await fetch(target, { headers: { Authorization: `Bearer ${token}` } })
    const contentType = upstream.headers.get('content-type') || ''
    if (!upstream.ok || contentType.includes('application/json')) {
      const detail = contentType.includes('application/json') ? await upstream.text() : ''
      return json({ error: `附件下载失败（HTTP ${upstream.status}）${detail.slice(0, 200)}` }, 502)
    }

    const headers = {
      'Content-Type': contentType || 'application/octet-stream',
      // file_token 变了就是另一张图，所以可以永久缓存
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    }

    // 小图（手机上传压过的那种）读进内存：既进实例缓存，也能塞进 Cache API。
    // 大图直接流式回传，避免把整张原图展开在 Worker 内存里（128MB 上限）。
    const length = Number(upstream.headers.get('content-length') || 0)
    if (length && length > MEDIA_MEMORY_ENTRY_LIMIT) {
      const streamed = new Response(upstream.body, { headers })
      if (cache && waitUntil) waitUntil(cache.put(cacheKey, streamed.clone()).catch(() => {}))
      return streamed
    }

    const body = await upstream.arrayBuffer()
    rememberMedia(file, { body, type: headers['Content-Type'] })
    const response = new Response(body, { headers })
    if (cache && waitUntil) waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}))
    return response
  } catch (e) {
    return json({ error: e.message || '附件下载失败' }, 502)
  }
}

export async function onRequestGet(context) {
  const { params } = context
  const segments = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean)
  const route = segments[0] || ''

  if (route === 'products') return handleProducts(context)
  if (route === 'media') return handleMedia(context)

  return json({ error: '接口不存在' }, 404)
}
