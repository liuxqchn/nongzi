import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { searchProducts, ensurePinyin, pinyinReady } from '../src/utils/fuzzy.js'
import { MOCK_PRODUCTS } from '../src/data/mockProducts.js'
import { normalizeCategory } from '../src/data/categories.js'

/**
 * 搜索回归测试：npm run test:search
 * 覆盖中文直搜、拼音全拼、拼音首字母、首字母容错与无意义输入。
 */
await ensurePinyin()
console.log('pinyinReady =', pinyinReady.value)

const list = MOCK_PRODUCTS.map((p, i) => ({ ...p, id: `m${i}` }))

const cases = [
  ['sj', '杀菌剂（拼音首字母）'],
  ['scj', '杀虫剂（拼音首字母）'],
  ['shajun', '杀菌剂（全拼）'],
  ['bcl', '吡虫啉（拼音首字母）'],
  ['bch', '吡虫啉（首字母容错）'],
  ['杀', '含"杀"字'],
  ['水稻', '适用作物'],
  ['吡虫啉', '全名'],
  ['叶面肥', '叶面肥'],
  ['zm', '芸苔素内酯'],
  ['xyz', '无意义输入（应为 0）'],
]

let failed = 0
for (const [q, desc] of cases) {
  const res = searchProducts(list, q)
  const expectEmpty = q === 'xyz'
  const ok = expectEmpty ? res.length === 0 : res.length > 0
  if (!ok) failed += 1
  console.log(
    `${ok ? 'PASS' : 'FAIL'} "${q}" (${desc}) -> ${res.length} hits:`,
    res.slice(0, 4).map((r) => r.name).join(' | '),
  )
}

// ---------------------------------------------------------------------------
// 用真实发货数据（public/products.json）再跑一遍，重点校验排序：
// 搜「sj」「shajun」时，用户想要的是「杀菌剂」分类，不能被「水剂」之类的词顶到前面。
// ---------------------------------------------------------------------------
const productsJson = new URL('../public/products.json', import.meta.url)
const raw = JSON.parse(await readFile(productsJson, 'utf8'))
const rawList = (Array.isArray(raw) ? raw : raw.items || raw.data || []).map((item, i) => ({
  ...item,
  id: String(item.id || `p${i}`),
  category: normalizeCategory(item.category),
}))

console.log('\n--- public/products.json ---')

const ordering = [
  ['sj', '杀菌剂'],
  ['shajun', '杀菌剂'],
  ['shachongji', '杀虫剂'],
  ['srf', '水溶肥'],
]

for (const [q, expectCategory] of ordering) {
  const res = searchProducts(rawList, q)
  const first = res[0]
  const ok = Boolean(first) && first.category === expectCategory
  if (!ok) failed += 1
  console.log(
    `${ok ? 'PASS' : 'FAIL'} "${q}" 首位应为「${expectCategory}」 -> ${res.length} hits:`,
    res.slice(0, 4).map((r) => `${r.name}(${r.category})`).join(' | '),
  )
}

const noise = searchProducts(rawList, 'xyz')
if (noise.length !== 0) {
  failed += 1
  console.log(`FAIL 无意义输入 "xyz" 应为 0，实际 ${noise.length} 条`)
} else {
  console.log('PASS "xyz" -> 0 hits')
}

const cropHits = searchProducts(rawList, '水稻')
const cropOk = cropHits.length > 0 && cropHits.every((p) => (p.crops || []).includes('水稻'))
if (!cropOk) failed += 1
console.log(
  `${cropOk ? 'PASS' : 'FAIL'} "水稻" -> ${cropHits.length} hits`,
  cropHits.slice(0, 4).map((r) => r.name).join(' | '),
)

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 个用例未通过`)
process.exit(failed === 0 ? 0 : 1)
