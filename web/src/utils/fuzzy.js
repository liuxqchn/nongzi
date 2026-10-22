import { ref } from 'vue'

/**
 * 模糊搜索（中文 + 拼音）：
 * 1. 字段内直接命中，商品名权重最高
 * 2. 拼音全拼命中（"shui" → 水稻，"shajun" → 杀菌剂）
 * 3. 拼音首字母命中（"sj" → 杀菌剂，"scj" → 杀虫剂，农户最常用的输入方式）
 * 4. 拼音首字母容错（"bch" → 吡虫啉，编辑距离 ≤ 1）
 * 5. 中文子序列命中（"吡虫" → 吡虫啉），限制跳跃距离避免乱匹配
 * 多个关键词以空格分隔时取交集。
 *
 * 拼音按「词/片段」匹配，而不是整段拼接，否则长句首字母里容易出现随机的两字母命中。
 *
 * pinyin-pro 自带字典约 200KB，这里改成按需异步加载：
 * 首屏不等待字典，用户输入字母时若字典未就绪，退化为纯文本匹配。
 */
const indexCache = new Map()

/** 字典是否就绪（响应式，搜索结果依赖它重新计算） */
export const pinyinReady = ref(false)

let pinyinFn = null
let loading = null

export function ensurePinyin() {
  if (pinyinReady.value) return Promise.resolve()
  if (!loading) {
    loading = import('pinyin-pro')
      .then((mod) => {
        pinyinFn = mod.pinyin
        pinyinReady.value = true
        indexCache.clear()
      })
      .catch(() => {
        pinyinFn = null
      })
  }
  return loading
}

/** 参与搜索的字段与权重（权重越高，命中后排名越靠前；typo 表示允许容错匹配） */
const FIELDS = [
  { key: 'name', weight: 100, typo: true },
  { key: 'phone', weight: 84 },
  { key: 'brand', weight: 72 },
  { key: 'category', weight: 62 },
  { key: 'ingredients', weight: 58 },
  { key: 'crops', weight: 54 },
  { key: 'tags', weight: 50 },
  { key: 'spec', weight: 44 },
  { key: 'dilution', weight: 40 },
  { key: 'usage', weight: 34 },
  { key: 'precautions', weight: 24 },
]

const SEPARATOR = /[\s,，、。；;：:！!？?（）()【】\[\]{}"'|/\\—\-_·+]+/

function fieldValues(product) {
  return {
    name: product.name,
    phone: product.phone,
    brand: product.brand,
    category: product.category,
    ingredients: product.ingredients,
    crops: (product.crops || []).join('、'),
    tags: (product.tags || []).join('、'),
    spec: product.spec,
    dilution: product.dilution,
    usage: product.usage,
    precautions: product.precautions,
  }
}

function toPinyin(text, pattern) {
  if (!pinyinFn || !text) return ''
  return pinyinFn(text, {
    toneType: 'none',
    type: 'array',
    nonZh: 'consecutive',
    ...(pattern ? { pattern } : null),
  })
    .join('')
    .toLowerCase()
}

function buildIndex(product) {
  const cached = indexCache.get(product.id)
  if (cached) return cached

  const values = fieldValues(product)
  const fields = {}

  for (const { key, weight, typo } of FIELDS) {
    const raw = String(values[key] || '')
    if (!raw.trim()) continue

    const text = raw.toLowerCase()
    const segments = raw
      .split(SEPARATOR)
      .filter(Boolean)
      .map((segment) => ({
        text: segment.toLowerCase(),
        full: toPinyin(segment),
        initials: toPinyin(segment, 'first'),
      }))

    fields[key] = { weight, text, segments, typo: Boolean(typo) }
  }

  const index = { fields }
  // 分类单独记一份拼音：搜「sj / shajun」时，用户往往想找的是某个分类，
  // 需要把该分类下的商品顶到前面，而不是被「水剂」「乳油」之类的词干扰。
  const categoryRaw = String(values.category || '')
  index.categoryFull = categoryRaw ? toPinyin(categoryRaw) : ''
  index.categoryInitials = categoryRaw ? toPinyin(categoryRaw, 'first') : ''
  indexCache.set(product.id, index)
  return index
}

/** 分类意图加成：搜索词命中分类名（拼音）时，给该分类的商品加权 */
function categoryBonus(index, token) {
  if (!LATIN.test(token)) return 0
  const full = index.categoryFull
  const initials = index.categoryInitials
  if (full && (full === token || full.startsWith(token))) return 60
  if (initials && token.length >= 2 && (initials === token || initials.startsWith(token))) return 45
  return 0
}

/** 允许有限跳跃的中文子序列匹配；跳跃过大或长度不足返回 0 */
function subsequenceScore(haystack, needle, maxGap = 2) {
  if (needle.length < 2) return 0
  let score = 0
  let pos = 0
  let streak = 0
  for (const ch of needle) {
    const found = haystack.indexOf(ch, pos)
    if (found === -1) return 0
    const gap = found - pos
    if (gap > maxGap) return 0
    streak = gap === 0 ? streak + 1 : 0
    score += 1 + streak
    pos = found + 1
  }
  return score
}

/** 编辑距离（只用于短字符串的容错匹配） */
function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[a.length][b.length]
}

/**
 * 容错匹配：只比较整个片段（而不是片段内部的滑动窗口），
 * 否则长句首字母里随便一个三字母窗口都会命中。
 */
function typoDistance(text, token) {
  if (!text || !token) return Infinity
  if (Math.abs(text.length - token.length) > 1) return Infinity
  return editDistance(text, token)
}

const LATIN = /^[a-z0-9.]+$/

function scoreChinese(field, token) {
  if (field.text.startsWith(token)) return field.weight
  if (field.text.includes(token)) return field.weight * 0.6
  const fuzzy = subsequenceScore(field.text, token)
  if (fuzzy > 0) return field.weight * 0.18
  return 0
}

function scoreLatin(field, token) {
  let best = 0

  // 整段原文命中（规格 "100ml/瓶"、成分 "P₂O₅" 这类）
  if (field.text.includes(token)) best = Math.max(best, field.weight * 0.55)

  for (const segment of field.segments) {
    if (segment.text.startsWith(token)) best = Math.max(best, field.weight)
    else if (segment.text.includes(token)) best = Math.max(best, field.weight * 0.65)

    if (segment.full) {
      if (segment.full.startsWith(token)) best = Math.max(best, field.weight * 0.85)
      else if (segment.full.includes(token)) best = Math.max(best, field.weight * 0.55)
      // 全拼容错："shajun" 打成 "shajin" 也能搜到
      else if (field.typo && token.length >= 4 && typoDistance(segment.full, token) <= 1) {
        best = Math.max(best, field.weight * 0.4)
      }
    }

    if (segment.initials) {
      // 首字母只做「前缀 / 全等」匹配：长句首字母里随便滑一个三字母窗口就命中
      // （例如「抗寒性与籽粒饱满度」的 khxyzlbmd 会吃掉 "xyz"），是误报的主要来源。
      if (segment.initials.startsWith(token)) best = Math.max(best, field.weight * 0.8)
      // 首字母容错：整词首字母，编辑距离 ≤ 1（"bch" → 吡虫啉）
      else if (
        field.typo &&
        token.length >= 3 &&
        segment.initials.length >= 3 &&
        typoDistance(segment.initials, token) <= 1
      ) {
        best = Math.max(best, field.weight * 0.32)
      }
    }
  }

  return best
}

function scoreToken(index, token) {
  let best = 0
  const isLatin = LATIN.test(token)
  for (const field of Object.values(index.fields)) {
    const score = isLatin ? scoreLatin(field, token) : scoreChinese(field, token)
    if (score > best) best = score
  }
  return best
}

/**
 * @param {Array} list 商品数组
 * @param {string} query 搜索词
 * @returns {Array} 命中且按相关度排序的商品
 */
export function searchProducts(list, query) {
  const tokens = String(query || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!tokens.length) return list

  const scored = []
  for (const product of list) {
    const index = buildIndex(product)
    let total = 0
    let matchedAll = true
    for (const token of tokens) {
      const score = scoreToken(index, token)
      if (score <= 0) {
        matchedAll = false
        break
      }
      total += score + categoryBonus(index, token)
    }
    if (matchedAll) scored.push({ product, score: total })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.map((item) => item.product)
}
