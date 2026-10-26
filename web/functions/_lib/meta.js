/**
 * 商品页的分享卡片 / SEO 元信息。
 * 纯函数，不碰网络，方便单元测试（scripts/test-meta.mjs）。
 *
 * 为什么不能只靠前端改 <meta>：微信、搜索引擎抓的是服务端返回的 HTML，
 * 页面里用 JS 改 og 标签对它们无效。所以 /p/<id> 这一层在返回 HTML 前就把标签替换好。
 */

const SHOP_NAME = '农资商品目录'
const FALLBACK_DESCRIPTION = '扫码即可查看商品成分、适用作物与用法用量，一键拨打老板电话。'

/** 列名同义词（和前端 productSource.js 的映射保持一致，避免两处打架） */
const FIELD_ALIASES = {
  name: ['商品名称', '名称', '产品名称', '品名'],
  brand: ['品牌', '厂家', '生产企业'],
  spec: ['规格', '规格型号', '包装规格'],
  ingredients: ['成分', '有效成分', '含量'],
  usage: ['用法用量', '使用方法', '施用方法'],
  price: ['价格', '单价', '零售价', '售价'],
  images: ['图片', '主图', '图片集', '产品图'],
  unit: ['单位', '计价单位'],
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function toText(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return entry
        if (entry && typeof entry === 'object') {
          if (typeof entry.text === 'string') return entry.text
          if (typeof entry.name === 'string') return entry.name
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

function pick(fields, names) {
  for (const name of names) {
    if (fields && fields[name] !== undefined && fields[name] !== null && fields[name] !== '') {
      return fields[name]
    }
  }
  return undefined
}

function truncate(text, max) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

/** 取第一个附件图片的代理地址（已是 /api/media?... 形式，由 publicItems 改写） */
function firstImage(fields) {
  const raw = pick(fields, FIELD_ALIASES.images)
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  for (const entry of list) {
    if (typeof entry === 'string' && entry) return entry
    if (entry && typeof entry === 'object' && typeof entry.url === 'string' && entry.url) {
      return entry.url
    }
  }
  return ''
}

/**
 * @param {{ item?: {record_id?: string, fields?: object} | null, origin: string }} input
 * @returns {{ title: string, description: string, image: string, url: string, jsonLd: string }}
 */
export function buildPageMeta({ item, origin }) {
  const base = String(origin || '').replace(/\/+$/, '')
  const fields = (item && item.fields) || {}
  const name = toText(pick(fields, FIELD_ALIASES.name)) || SHOP_NAME
  const brand = toText(pick(fields, FIELD_ALIASES.brand))
  const spec = toText(pick(fields, FIELD_ALIASES.spec))
  const ingredients = toText(pick(fields, FIELD_ALIASES.ingredients))
  const usage = toText(pick(fields, FIELD_ALIASES.usage))
  const priceText = toText(pick(fields, FIELD_ALIASES.price))
  const price = Number.parseFloat(priceText.replace(/[^\d.]/g, ''))

  const isProduct = Boolean(item && item.record_id)
  const title = isProduct ? `${name} · ${SHOP_NAME}` : `${SHOP_NAME} · 扫码看货 · 一键问价`
  const parts = [brand, spec, ingredients, usage].filter(Boolean)
  const description = truncate(
    parts.length ? `${parts.join(' · ')}${priceText ? ` · ¥${priceText}` : ''}` : FALLBACK_DESCRIPTION,
    110,
  )

  const raw = firstImage(fields)
  const image = raw
    ? raw.startsWith('http')
      ? raw
      : `${base}${raw}`
    : `${base}/og-cover.jpg`
  const url = isProduct ? `${base}/p/${encodeURIComponent(item.record_id)}` : `${base}/`

  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    url,
    image: [image],
    ...(brand ? { brand: { '@type': 'Brand', name: brand } } : {}),
    ...(Number.isFinite(price)
      ? {
          offers: {
            '@type': 'Offer',
            price: String(price),
            priceCurrency: 'CNY',
            availability: 'https://schema.org/InStock',
            url,
          },
        }
      : {}),
  }

  return {
    title,
    description,
    image,
    url,
    // </script> 会把内联 JSON 提前截断，转义掉尖括号
    jsonLd: JSON.stringify(product).replace(/</g, '\\u003c'),
  }
}

/** 生成 og / twitter 标签块（由 index.html 里的 <!-- og:start --> 标记占据的位置替换） */
export function renderMetaTags(meta) {
  const title = escapeHtml(meta.title)
  const description = escapeHtml(meta.description)
  const image = escapeHtml(meta.image)
  const url = escapeHtml(meta.url)
  return [
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${escapeHtml(SHOP_NAME)}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
  ].join('\n    ')
}

/**
 * 把构建好的 meta 注入到 HTML：替换标题、og 标记块、JSON-LD 占位。
 * 找不到标记时退回「只替换标题」，不会把页面搞坏。
 */
export function injectMeta(html, meta) {
  let output = String(html)

  output = output.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)

  if (output.includes('<!-- og:start -->')) {
    output = output.replace(
      /<!-- og:start -->[\s\S]*?<!-- og:end -->/,
      `<!-- og:start -->\n    ${renderMetaTags(meta)}\n    <!-- og:end -->`,
    )
  }

  if (output.includes('<!-- jsonld -->')) {
    output = output.replace(
      '<!-- jsonld -->',
      `<script type="application/ld+json">${meta.jsonLd}</script>`,
    )
  }

  return output
}
