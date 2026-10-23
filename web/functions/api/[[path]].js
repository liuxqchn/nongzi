/**
 * 站点后端（Cloudflare Pages Function，挂在 /api/* 下）。
 *
 * 为什么需要它：飞书开放平台不返回 CORS 头，浏览器里的 H5 无法直接调多维表格接口；
 * 附件图片的下载地址还要带 Authorization，<img src> 也发不出去。所以由这个同源接口代劳，
 * app_secret 只存在 Cloudflare 环境变量里，不会打进前端产物。
 *
 * 环境变量（Pages → 设置 → 变量和密钥，建议都设成加密）：
 *   FEISHU_APP_ID      企业自建应用的 App ID
 *   FEISHU_APP_SECRET  企业自建应用的 App Secret
 *   FEISHU_APP_TOKEN   多维表格的 app_token（表格链接 /base/ 后面那段）
 *   FEISHU_TABLE_ID    目标表的 table_id（链接 ?table= 后面那段）
 * 可选：
 *   FEISHU_DOMAIN      默认 https://open.feishu.cn（Lark 国际版用 https://open.larksuite.com）
 *   FEISHU_CACHE_TTL   记录缓存秒数，默认 30
 *
 * 路由：
 *   GET /api/products          取当前表格内容（最多缓存 FEISHU_CACHE_TTL 秒）
 *   GET /api/products?fresh=1  跳过缓存，用于「重新加载商品」
 *   GET /api/media?file=<token> 附件图片（表格「图片」列），带长期边缘缓存
 */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }

// 同一个 Worker 实例里复用，减少对飞书的请求
let tokenCache = { token: '', expiresAt: 0 }
let recordCache = { payload: '', items: [], mediaTokens: new Set(), expiresAt: 0 }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function domain(env) {
  return env.FEISHU_DOMAIN || 'https://open.feishu.cn'
}

function requireEnv(env) {
  return ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_APP_TOKEN', 'FEISHU_TABLE_ID'].filter(
    (key) => !env[key],
  )
}

/** 取 tenant_access_token，并在实例内存里缓存到过期前 5 分钟 */
async function getTenantToken(env) {
  const now = Date.now()
  if (tokenCache.token && tokenCache.expiresAt > now) return tokenCache.token

  const response = await fetch(`${domain(env)}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }),
  })
  const payload = await response.json()
  if (payload.code !== 0 || !payload.tenant_access_token) {
    throw new Error(`获取 tenant_access_token 失败：${payload.msg || payload.code}`)
  }

  const ttl = Math.max(60, Number(payload.expire || 7200) - 300) * 1000
  tokenCache = { token: payload.tenant_access_token, expiresAt: now + ttl }
  return tokenCache.token
}

/** 记录里所有附件（图片）的 file_token，用来给 /api/media 做白名单，避免变成任意文件下载器 */
function collectMediaTokens(items) {
  const tokens = new Set()
  for (const item of items) {
    for (const value of Object.values(item.fields || {})) {
      if (!Array.isArray(value)) continue
      for (const entry of value) {
        if (entry && typeof entry === 'object' && typeof entry.file_token === 'string') {
          tokens.add(entry.file_token)
        }
      }
    }
  }
  return tokens
}

/**
 * 把附件对象里的 url 换成本站的图片代理地址。
 * 飞书返回的 url 需要 Authorization 头，浏览器 <img> 用不了，留着只会显示裂图。
 */
function rewriteAttachmentUrls(items) {
  for (const item of items) {
    for (const value of Object.values(item.fields || {})) {
      if (!Array.isArray(value)) continue
      for (const entry of value) {
        if (entry && typeof entry === 'object' && typeof entry.file_token === 'string') {
          entry.url = `/api/media?file=${encodeURIComponent(entry.file_token)}`
          delete entry.tmp_url
        }
      }
    }
  }
  return items
}

/** 分页拉取整张表的记录（带实例内缓存） */
async function fetchRecords(env) {
  const now = Date.now()
  if (recordCache.items.length && recordCache.expiresAt > now) return recordCache

  const token = await getTenantToken(env)
  const base = `${domain(env)}/open-apis/bitable/v1/apps/${env.FEISHU_APP_TOKEN}/tables/${env.FEISHU_TABLE_ID}/records`

  const items = []
  let pageToken = ''
  let guard = 0

  do {
    const url = new URL(base)
    url.searchParams.set('page_size', '500')
    if (pageToken) url.searchParams.set('page_token', pageToken)

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const payload = await response.json()
    if (payload.code !== 0) {
      throw new Error(`读取多维表格失败：${payload.msg || payload.code}`)
    }

    const data = payload.data || {}
    items.push(...(data.items || []))
    pageToken = data.has_more ? data.page_token || '' : ''
    guard += 1
  } while (pageToken && guard < 50)

  const ttl = Math.max(0, Number(env.FEISHU_CACHE_TTL || 30)) * 1000
  recordCache = {
    items,
    mediaTokens: collectMediaTokens(items),
    payload: JSON.stringify({ items: rewriteAttachmentUrls(items) }),
    expiresAt: now + ttl,
  }
  return recordCache
}

async function handleProducts({ request, env }) {
  const missing = requireEnv(env)
  if (missing.length) {
    return json({ error: `服务端还没配置 ${missing.join('、')}`, items: [] }, 503)
  }

  const fresh = new URL(request.url).searchParams.get('fresh') === '1'

  try {
    if (!fresh && recordCache.payload) {
      return new Response(recordCache.payload, {
        headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
      })
    }
    if (fresh) recordCache = { ...recordCache, payload: '', expiresAt: 0 }
    const { payload } = await fetchRecords(env)
    return new Response(payload, { headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' } })
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

  const cacheKey = new Request(`https://nongzi-media.internal/${file}`, { method: 'GET' })
  const cache = typeof caches !== 'undefined' ? caches.default : null
  if (cache) {
    const hit = await cache.match(cacheKey)
    if (hit) return hit
  }

  try {
    const { mediaTokens } = await fetchRecords(env)
    // 只放行表格里真实存在的附件，挡住拿接口当任意文件下载器的用法
    if (!mediaTokens.has(file)) {
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

    const response = new Response(upstream.body, {
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        // file_token 变了就是另一张图，所以可以永久缓存
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
    if (cache && waitUntil) waitUntil(cache.put(cacheKey, response.clone()))
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
