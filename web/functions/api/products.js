/**
 * 商品目录服务端代理（Cloudflare Pages Function）。
 *
 * 为什么必须有它：飞书开放平台不返回 Access-Control-Allow-Origin，
 * 浏览器里的 H5 无法直接跨域调用多维表格接口（OPTIONS 预检直接 404）。
 * 所以由这个同源接口代为请求，app_secret 只存在 Cloudflare 的环境变量里，
 * 不会打进前端产物，也不会暴露给浏览器。
 *
 * 环境变量（Pages → Settings → Environment variables，建议都设为 Secret）：
 *   FEISHU_APP_ID     企业自建应用的 App ID
 *   FEISHU_APP_SECRET 企业自建应用的 App Secret
 *   FEISHU_APP_TOKEN  多维表格的 app_token（表格链接 /base/ 后面那段）
 *   FEISHU_TABLE_ID   目标表的 table_id（链接 ?table= 后面那段）
 * 可选：
 *   FEISHU_DOMAIN     默认 https://open.feishu.cn（Lark 国际版用 https://open.larksuite.com）
 *   FEISHU_CACHE_TTL  记录缓存秒数，默认 30
 *
 * 路由：GET /api/products         取当前表格内容（最多缓存 FEISHU_CACHE_TTL 秒）
 *       GET /api/products?fresh=1 跳过缓存，用于「重新加载商品」
 */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }

let tokenCache = { token: '', expiresAt: 0 }
let recordCache = { payload: '', expiresAt: 0 }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function domain(env) {
  return env.FEISHU_DOMAIN || 'https://open.feishu.cn'
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

/** 分页拉取整张表的记录 */
async function fetchRecords(env) {
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

  return items
}

export async function onRequestGet({ request, env }) {
  const missing = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_APP_TOKEN', 'FEISHU_TABLE_ID'].filter(
    (key) => !env[key],
  )
  if (missing.length) {
    return json({ error: `服务端还没配置 ${missing.join('、')}`, items: [] }, 503)
  }

  const fresh = new URL(request.url).searchParams.get('fresh') === '1'
  const now = Date.now()

  if (!fresh && recordCache.payload && recordCache.expiresAt > now) {
    return new Response(recordCache.payload, { headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' } })
  }

  try {
    const items = await fetchRecords(env)
    const payload = JSON.stringify({ items, updatedAt: new Date().toISOString() })
    const ttl = Math.max(0, Number(env.FEISHU_CACHE_TTL || 30)) * 1000
    recordCache = { payload, expiresAt: now + ttl }
    return new Response(payload, { headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' } })
  } catch (e) {
    return json({ error: e.message || '读取多维表格失败', items: [] }, 502)
  }
}
