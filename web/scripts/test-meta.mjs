/**
 * 单元测试：字段白名单（防内部列泄漏）+ 分享卡片元信息注入。
 * 纯函数，不需要网络和 Cloudflare 环境：`npm run test:meta`
 */

import assert from 'node:assert/strict'

import { collectMediaTokens, hiddenFieldTest, publicItems } from '../functions/_lib/feishu.js'
import { buildPageMeta, injectMeta, renderMetaTags } from '../functions/_lib/meta.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const record = (fields) => ({ record_id: 'recABC123', fields })
const attachment = (token) => ({ file_token: token, name: 'a.jpg', url: 'https://internal/x', tmp_url: 'https://tmp/x', size: 100 })

test('默认黑名单挡掉成本/进价/备注列', () => {
  const items = publicItems(
    [
      record({
        商品名称: '吡虫啉 70%',
        成本价: 2.1,
        进货价: 1.8,
        内部备注: '老板说别外传',
        零售价: 3.5,
      }),
    ],
    {},
  )
  assert.equal(items[0].fields['零售价'], 3.5)
  assert.equal(items[0].fields['成本价'], undefined)
  assert.equal(items[0].fields['进货价'], undefined)
  assert.equal(items[0].fields['内部备注'], undefined)
  assert.equal(items[0].record_id, 'recABC123')
})

test('FEISHU_HIDDEN_FIELDS 一旦填写就完全按它来', () => {
  const env = { FEISHU_HIDDEN_FIELDS: '供应商, 底价' }
  const isHidden = hiddenFieldTest(env)
  assert.equal(isHidden('供应商'), true)
  assert.equal(isHidden('底价'), true)
  // 没列进去的「成本」此时会外发 —— 这正是文档里要提醒的坑，测试固定住这个行为
  assert.equal(isHidden('成本'), false)
})

test('附件地址改写成同源代理，tmp_url 被丢掉', () => {
  const items = publicItems([record({ 图片: [attachment('boxcnAbC_123')] })], {})
  const entry = items[0].fields['图片'][0]
  assert.equal(entry.url, '/api/media?file=boxcnAbC_123')
  assert.equal(entry.tmp_url, undefined)
  assert.equal(entry.file_token, 'boxcnAbC_123')
})

test('隐藏列里的附件不会进入媒体白名单', () => {
  const items = [
    record({ 图片: [attachment('visible01')], 成本单: [attachment('secret002')] }),
  ]
  const tokens = collectMediaTokens(items, {})
  assert.equal(tokens.has('visible01'), true)
  assert.equal(tokens.has('secret002'), false)
})

test('分享卡片取商品名、图片、价格，并拼出 /p/<id>', () => {
  const items = publicItems(
    [
      record({
        商品名称: '吡虫啉 70% 水分散粒剂',
        品牌: '田园生化',
        规格: '10g/袋',
        有效成分: '吡虫啉 70%',
        价格: 3.5,
        图片: [attachment('boxcnAbC_123')],
      }),
    ],
    {},
  )
  const meta = buildPageMeta({ item: items[0], origin: 'https://nongzi.pages.dev' })

  assert.equal(meta.title, '吡虫啉 70% 水分散粒剂 · 农资商品目录')
  assert.equal(meta.url, 'https://nongzi.pages.dev/p/recABC123')
  assert.equal(meta.image, 'https://nongzi.pages.dev/api/media?file=boxcnAbC_123')
  assert.ok(meta.description.includes('田园生化'))
  assert.ok(meta.description.includes('¥3.5'))

  const ld = JSON.parse(meta.jsonLd)
  assert.equal(ld['@type'], 'Product')
  assert.equal(ld.name, '吡虫啉 70% 水分散粒剂')
  assert.equal(ld.offers.price, '3.5')
  assert.equal(ld.offers.priceCurrency, 'CNY')
})

test('没有商品时退回店铺卡片与默认封面', () => {
  const meta = buildPageMeta({ item: null, origin: 'https://nongzi.pages.dev/' })
  assert.ok(meta.title.includes('农资商品目录'))
  assert.equal(meta.url, 'https://nongzi.pages.dev/')
  assert.equal(meta.image, 'https://nongzi.pages.dev/og-cover.jpg')
  assert.equal(JSON.parse(meta.jsonLd).offers, undefined)
})

test('标题里的引号和尖括号会被转义，不会破坏 HTML', () => {
  const items = publicItems([record({ 商品名称: 'A"B<C>D' })], {})
  const meta = buildPageMeta({ item: items[0], origin: 'https://x.dev' })
  const tags = renderMetaTags(meta)
  assert.ok(tags.includes('A&quot;B&lt;C&gt;D'))
  assert.ok(!tags.includes('content="A"B'))
  // JSON-LD 里的 < 被转义成 \u003c，不会提前闭合 script
  assert.ok(!meta.jsonLd.includes('<'))
})

test('injectMeta 替换标题、og 块与 JSON-LD 占位', () => {
  const html = `<!doctype html><html><head>
    <title>旧标题</title>
    <!-- og:start -->
    <meta property="og:title" content="旧" />
    <!-- og:end -->
    <!-- jsonld -->
  </head><body><div id="app"></div></body></html>`

  const items = publicItems([record({ 商品名称: '多菌灵', 价格: '12', 图片: [attachment('token999')] })], {})
  const out = injectMeta(html, buildPageMeta({ item: items[0], origin: 'https://nongzi.pages.dev' }))

  assert.ok(out.includes('<title>多菌灵 · 农资商品目录</title>'))
  assert.ok(!out.includes('content="旧"'))
  assert.ok(out.includes('og:image" content="https://nongzi.pages.dev/api/media?file=token999"'))
  assert.ok(out.includes('<script type="application/ld+json">'))
  assert.ok(out.includes('<div id="app"></div>'), '页面主体不能被破坏')
  assert.equal((out.match(/og:title/g) || []).length, 1, 'og:title 只应出现一次')
})

test('找不到占位标记时只换标题，不抛错', () => {
  const out = injectMeta('<html><head><title>x</title></head></html>', {
    title: '新标题',
    description: 'd',
    image: 'i',
    url: 'u',
    jsonLd: '{}',
  })
  assert.ok(out.includes('<title>新标题</title>'))
})

let failed = 0
for (const { name, fn } of tests) {
  try {
    fn()
    console.log(`ok   ${name}`)
  } catch (e) {
    failed += 1
    console.error(`FAIL ${name}\n     ${e.message}`)
  }
}

console.log(`\n${tests.length - failed}/${tests.length} 通过`)
process.exit(failed ? 1 : 0)
