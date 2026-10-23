import { normalizeCategory } from '../data/categories'
import { MOCK_PRODUCTS } from '../data/mockProducts'

const STORAGE_KEY = 'nongzi.catalog.source'

export const SOURCE_LABELS = {
  bitable: '飞书多维表格',
  local: '本地 products.json',
  mock: '内置示例数据',
}

const DEFAULT_FIELD_MAP = {
  id: ['商品ID', '编号', 'id', 'ID'],
  name: ['商品名称', '名称', '产品名称', '品名'],
  brand: ['品牌', '厂家', '生产企业'],
  category: ['分类', '类别', '产品分类'],
  spec: ['规格', '规格型号', '包装规格'],
  price: ['价格', '单价', '零售价', '售价'],
  unit: ['单位', '计价单位'],
  images: ['图片', '主图', '图片集', '产品图'],
  ingredients: ['成分', '有效成分', '含量'],
  crops: ['适用作物', '作物', '适用范围'],
  dilution: ['稀释倍数', '稀释比例', '兑水比例'],
  usage: ['用法用量', '使用方法', '施用方法'],
  precautions: ['注意事项', '安全间隔期'],
  tags: ['标签', '卖点', '特性'],
  stock: ['库存', '供货状态'],
  phone: ['联系电话', '电话', '老板电话', '手机号'],
}

/** 读取运行时配置：public/config.js 打底 + localStorage 覆盖 */
export function readConfig() {
  const base = (typeof window !== 'undefined' && window.__NONGZI_CONFIG__) || {}
  let stored = {}
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    stored = {}
  }
  return {
    shop: { ...(base.shop || {}), ...(stored.shop || {}) },
    bitable: { ...(base.bitable || {}), ...(stored.bitable || {}) },
    source: stored.source || base.source || 'auto',
    fieldMap: { ...DEFAULT_FIELD_MAP, ...(base.fieldMap || {}), ...(stored.fieldMap || {}) },
  }
}

/** 保存商户在页面上改的数据源配置 */
export function saveConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearStoredConfig() {
  localStorage.removeItem(STORAGE_KEY)
}

function firstField(fields, names) {
  for (const name of names) {
    if (fields[name] !== undefined && fields[name] !== null && fields[name] !== '') {
      return fields[name]
    }
  }
  return undefined
}

/** 把多维表格的富文本 / 数组值转成纯文本 */
function toText(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          if (typeof item.text === 'string') return item.text
          if (typeof item.name === 'string') return item.name
        }
        return ''
      })
      .filter(Boolean)
      .join('、')
  }
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text.trim()
    if (typeof value.name === 'string') return value.name.trim()
  }
  return ''
}

/** 把多维表格附件 / 链接字段转成图片地址数组 */
function toImages(value) {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  return list
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') return item.url || item.tmp_url || ''
      return ''
    })
    .filter(Boolean)
}

/**
 * 补上部署基路径。
 * 站点内图片写的是 /img/xxx.svg 这种根路径，部署到子路径（如 GitHub Pages 的 /仓库名/）
 * 时会被解析到域名根目录而 404，这里统一拼上 BASE_URL。
 */
export function withBasePath(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value)) return value
  if (/^(?:data|blob):/i.test(value)) return value
  if (!value.startsWith('/')) return value
  const base = import.meta.env.BASE_URL || '/'
  return `${base}${value.slice(1)}`.replace(/\/{2,}/g, '/')
}

function toList(value) {
  const text = toText(value)
  if (!text) return []
  return text
    .split(/[、,，;；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function toNumber(value) {
  if (typeof value === 'number') return value
  const text = toText(value)
  if (!text) return null
  const parsed = Number.parseFloat(text.replace(/[^\d.]/g, ''))
  return Number.isNaN(parsed) ? null : parsed
}

/** 统一商品结构 */
export function normalizeProduct(raw, index = 0) {
  const images = toImages(raw.images).length
    ? toImages(raw.images)
    : raw.image
      ? toImages(raw.image)
      : []
  const price = toNumber(raw.price)
  return {
    id: String(raw.id || `product-${index + 1}`),
    name: toText(raw.name) || '未命名商品',
    brand: toText(raw.brand),
    category: normalizeCategory(toText(raw.category)),
    spec: toText(raw.spec),
    price: price === null ? null : price,
    unit: toText(raw.unit),
    images: images.map(withBasePath),
    ingredients: toText(raw.ingredients),
    crops: toList(raw.crops),
    dilution: toText(raw.dilution),
    usage: toText(raw.usage),
    precautions: toText(raw.precautions),
    tags: toList(raw.tags),
    stock: toText(raw.stock),
    phone: toText(raw.phone),
  }
}

/**
 * 飞书多维表格只读拉取。
 * 需要 app_token / table_id / 一个有读权限的 token（user_access_token 或 tenant_access_token）。
 */
export async function fetchBitable(config) {
  const { appToken, tableId, token, pageSize = 500, domain = 'https://open.feishu.cn' } = config
  if (!appToken || !tableId || !token) {
    throw new Error('飞书多维表格配置不完整（需要 appToken / tableId / token）')
  }

  const items = []
  let pageToken = ''
  let guard = 0

  do {
    const params = new URLSearchParams({ page_size: String(pageSize) })
    if (pageToken) params.set('page_token', pageToken)

    const url = `${domain}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?${params.toString()}`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`飞书接口请求失败（HTTP ${response.status}）`)
    }

    const payload = await response.json()
    if (payload.code !== 0) {
      throw new Error(`飞书接口返回异常：${payload.msg || payload.code}`)
    }

    const data = payload.data || {}
    items.push(...(data.items || []))
    pageToken = data.has_more ? data.page_token : ''
    guard += 1
    if (guard > 50) break
  } while (pageToken)

  return items.map((item, index) =>
    normalizeProduct(
      {
        id: item.record_id,
        ...readFields(item.fields || {}, config.fieldMap),
      },
      index,
    ),
  )
}

function readFields(fields, fieldMap) {
  const result = {}
  for (const [key, names] of Object.entries(fieldMap)) {
    const value = firstField(fields, names)
    if (value !== undefined) result[key] = value
  }
  return result
}

/**
 * 兼容两种返回：
 * - 多维表格原始记录 { record_id, fields }
 * - 已经拍平好的商品对象
 */
function normalizeRecord(item, index, fieldMap) {
  if (item && typeof item === 'object' && item.fields && typeof item.fields === 'object') {
    return normalizeProduct({ id: item.record_id, ...readFields(item.fields, fieldMap) }, index)
  }
  return normalizeProduct(item, index)
}

/**
 * 走同源代理（/api/products）读商品。
 * 飞书的 Open API 不放行跨域，浏览器不能直接调，所以默认由服务端代理转发，
 * app_secret 留在 Cloudflare 环境变量里，不会暴露到前端。
 *
 * @returns {Promise<Array|null>} null 表示这个站点没部署该接口（例如 GitHub Pages 备用站）
 */
export async function fetchProxyProducts(
  base = import.meta.env.BASE_URL || '/',
  fieldMap = DEFAULT_FIELD_MAP,
  options = {},
) {
  const url = `${base}api/products`.replace(/\/{2,}/g, '/')
  const target = options.fresh ? `${url}?fresh=1` : url

  // Pages Function 偶尔会直接把复用中的连接掐掉（浏览器报 Failed to fetch），
  // 单次抖动不该让页面降级成本地数据，所以网络层失败时重试一次。
  const request = () => fetch(target, { cache: 'no-cache' })
  let response
  try {
    response = await request()
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 400))
    response = await request()
  }
  if (response.status === 404 || response.status === 501) {
    return null
  }
  // 没部署接口的静态站（如 GitHub Pages 备用站）会把 index.html 当 200 返回，直接跳过
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return null
  }
  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json()
      detail = payload.error || ''
    } catch {
      /* 拿不到 JSON 就只报状态码 */
    }
    throw new Error(`商品接口请求失败（HTTP ${response.status}）${detail ? '：' + detail : ''}`)
  }

  const payload = await response.json()
  const items = Array.isArray(payload) ? payload : payload.items || payload.data || []
  return items.map((item, index) => normalizeRecord(item, index, fieldMap))
}

/** 读取站点内置的 products.json */
export async function fetchLocalProducts(base = import.meta.env.BASE_URL || '/') {
  const url = `${base}products.json`.replace(/\/{2,}/g, '/')
  const response = await fetch(url, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`products.json 读取失败（HTTP ${response.status}）`)
  const payload = await response.json()
  const list = Array.isArray(payload) ? payload : payload.items || payload.data || []
  return list.map((item, index) => normalizeProduct(item, index))
}

/**
 * 统一入口：按配置决定数据源，任何失败都会降级，最终一定返回可展示的数据。
 * @returns {Promise<{products: Array, source: string, warning: string}>}
 */
export async function loadProducts(options = {}) {
  const config = readConfig()
  const base = import.meta.env.BASE_URL || '/'
  const warnings = []

  const prefer = config.source || 'auto'

  const tryBitable = async () => {
    const bitable = config.bitable || {}
    if (!bitable.enabled) return null

    // 默认走同源代理：凭证在服务端，浏览器不接触 app_secret
    if (bitable.proxy !== false) {
      const list = await fetchProxyProducts(base, config.fieldMap, options)
      if (!list) return null
      if (!list.length) throw new Error('商品接口没有返回商品')
      return list
    }

    // 浏览器直连飞书：需要自带令牌，且飞书要放行跨域
    if (!bitable.appToken || !bitable.tableId || !bitable.token) {
      return null
    }
    const list = await fetchBitable({ ...bitable, fieldMap: config.fieldMap })
    if (!list.length) throw new Error('飞书多维表格里还没有商品记录')
    return list
  }

  const tryLocal = async () => {
    const list = await fetchLocalProducts(base)
    if (!list.length) throw new Error('products.json 里还没有商品')
    return list
  }

  const order =
    prefer === 'bitable' ? ['bitable', 'local', 'mock'] : prefer === 'local' ? ['local', 'bitable', 'mock'] : ['bitable', 'local', 'mock']

  for (const source of order) {
    try {
      if (source === 'bitable') {
        const list = await tryBitable()
        if (list) return { products: list, source: 'bitable', warning: warnings.join('') }
        continue
      }
      if (source === 'local') {
        const list = await tryLocal()
        return { products: list, source: 'local', warning: warnings.join('') }
      }
    } catch (e) {
      warnings.push(`${SOURCE_LABELS[source]}加载失败：${e.message}；`)
    }
  }

  return {
    products: MOCK_PRODUCTS.map((item, index) => normalizeProduct(item, index)),
    source: 'mock',
    warning: warnings.join(''),
  }
}
