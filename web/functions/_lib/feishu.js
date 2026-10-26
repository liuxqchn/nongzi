/**
 * 飞书多维表格访问层，被 /api/* 和 /p/<id> 共用。
 *
 * 目录名以 `_` 开头：Cloudflare Pages 的路由器会忽略下划线开头的文件/目录，
 * 所以这里放公共代码不会被当成接口暴露出去。
 *
 * 环境变量（Pages → 设置 → 变量和密钥）：
 *   FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_APP_TOKEN / FEISHU_TABLE_ID  必需
 *   FEISHU_DOMAIN       可选，Lark 国际版填 https://open.larksuite.com
 *   FEISHU_CACHE_TTL    可选，记录缓存秒数，默认 30
 *   FEISHU_REV          可选，附件下载 extra.bitablePerm.rev，默认 0
 *   FEISHU_HIDDEN_FIELDS 可选，逗号分隔的「不对外」列名。一旦填了就完全按你列的来，
 *                       内置黑名单（成本/进价/利润/备注…）不再生效 —— 别把成本列忘了。
 */

const DEFAULT_HIDDEN = /成本|进价|进货|毛利|利润|采购|底价|内部|备注|经手人|供应商|返点/

let tokenCache = { token: '', expiresAt: 0 }
let recordCache = { items: [], expiresAt: 0 }

export const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

export function domain(env) {
  return env.FEISHU_DOMAIN || 'https://open.feishu.cn'
}

export function requireEnv(env) {
  return ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_APP_TOKEN', 'FEISHU_TABLE_ID'].filter(
    (key) => !env[key],
  )
}

/** 取 tenant_access_token，实例内存缓存到过期前 5 分钟 */
export async function getTenantToken(env) {
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

/**
 * 哪些列不对外。
 * 默认按关键词挡掉「成本 / 进价 / 利润 / 备注」这类内部列，避免顾客按 F12 看到；
 * 设了 FEISHU_HIDDEN_FIELDS 就完全按它来（逗号分隔、精确匹配列名）。
 */
export function hiddenFieldTest(env) {
  const raw = String(env?.FEISHU_HIDDEN_FIELDS || '').trim()
  if (!raw) return (name) => DEFAULT_HIDDEN.test(String(name))
  const names = raw
    .split(/[,，]/)
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
  return (name) => names.includes(String(name).trim().toLowerCase())
}

/**
 * 把附件对象里的 url 换成本站图片代理地址。
 * 飞书返回的 url 需要 Authorization 头，浏览器 <img> 用不了，留着只会裂图。
 */
function rewriteAttachment(entry) {
  if (!entry || typeof entry !== 'object' || typeof entry.file_token !== 'string') return entry
  entry.url = `/api/media?file=${encodeURIComponent(entry.file_token)}`
  delete entry.tmp_url
  return entry
}

/** 输出去敏后的记录：隐藏列整列丢弃，图片列换成同源代理地址 */
export function publicItems(items, env) {
  const isHidden = hiddenFieldTest(env)
  return items.map((item) => {
    const fields = {}
    for (const [name, value] of Object.entries(item.fields || {})) {
      if (isHidden(name)) continue
      if (Array.isArray(value)) {
        fields[name] = value.map((entry) => rewriteAttachment(entry))
      } else {
        fields[name] = value
      }
    }
    return { record_id: item.record_id, fields }
  })
}

/** 记录里所有可对外附件（图片）的 file_token，给 /api/media 做白名单 */
export function collectMediaTokens(items, env) {
  const isHidden = hiddenFieldTest(env)
  const tokens = new Set()
  for (const item of items) {
    for (const [name, value] of Object.entries(item.fields || {})) {
      if (isHidden(name) || !Array.isArray(value)) continue
      for (const entry of value) {
        if (entry && typeof entry === 'object' && typeof entry.file_token === 'string') {
          tokens.add(entry.file_token)
        }
      }
    }
  }
  return tokens
}

/** 分页拉取整张表的记录（带实例内缓存） */
export async function fetchRecords(env, options = {}) {
  const now = Date.now()
  if (!options.fresh && recordCache.items.length && recordCache.expiresAt > now) return recordCache

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
  recordCache = { items, expiresAt: now + ttl }
  return recordCache
}
