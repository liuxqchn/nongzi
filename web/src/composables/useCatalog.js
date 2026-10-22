import { computed, onMounted, ref } from 'vue'
import { CATEGORIES } from '../data/categories'
import { loadProducts, SOURCE_LABELS } from '../services/productSource'
import { ensurePinyin, pinyinReady, searchProducts } from '../utils/fuzzy'

export function useCatalog() {
  const products = ref([])
  const loading = ref(true)
  const error = ref('')
  const source = ref('mock')
  const keyword = ref('')
  const category = ref('全部')
  const detail = ref(null)

  async function reload() {
    loading.value = true
    error.value = ''
    try {
      const result = await loadProducts()
      products.value = result.products
      source.value = result.source
      error.value = result.warning || ''
    } catch (e) {
      error.value = e.message || '商品数据加载失败'
    } finally {
      loading.value = false
    }
  }

  const filtered = computed(() => {
    // 依赖 pinyinReady：字典异步加载完成后，搜索结果会自动重新计算
    pinyinReady.value
    const list =
      category.value === '全部'
        ? products.value
        : products.value.filter((item) => item.category === category.value)

    const query = keyword.value.trim()
    if (!query) return list
    return searchProducts(list, query)
  })

  /** 每个分类下的商品数量（含"全部"） */
  const counts = computed(() => {
    const result = {}
    for (const item of CATEGORIES) result[item] = 0
    result['全部'] = products.value.length
    for (const product of products.value) {
      if (result[product.category] !== undefined) result[product.category] += 1
    }
    return result
  })

  const sourceLabel = computed(() => SOURCE_LABELS[source.value] || '未知数据源')

  function openDetail(product) {
    detail.value = product
  }

  function closeDetail() {
    detail.value = null
  }

  onMounted(() => {
    ensurePinyin()
    reload()
  })

  return {
    products,
    loading,
    error,
    source,
    sourceLabel,
    keyword,
    category,
    detail,
    filtered,
    counts,
    reload,
    openDetail,
    closeDetail,
  }
}
