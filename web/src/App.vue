<script setup>
import { computed, ref, watch } from 'vue'
import AppFooter from './components/AppFooter.vue'
import AppHeader from './components/AppHeader.vue'
import CategoryTabs from './components/CategoryTabs.vue'
import DataSourceDialog from './components/DataSourceDialog.vue'
import ProductDrawer from './components/ProductDrawer.vue'
import ProductGrid from './components/ProductGrid.vue'
import SearchBar from './components/SearchBar.vue'
import Toast from './components/Toast.vue'
import WechatGuide from './components/WechatGuide.vue'
import { useCatalog } from './composables/useCatalog'
import { useToast } from './composables/useToast'
import { useWechat } from './composables/useWechat'
import { callPhone } from './utils/phone'
import { readConfig } from './services/productSource'
import { admin, setReporter, tapTitle as reportTitleTap } from './composables/useAdmin'

const {
  loading,
  error,
  source,
  sourceLabel,
  keyword,
  category,
  detail,
  products,
  filtered,
  counts,
  reload,
  openDetail,
  closeDetail,
} = useCatalog()

const { message, show } = useToast()
const { showGuide, dismiss } = useWechat()

// 顾客看不到数据源入口，只有供应商用 ?manage=1 或连点标题才能打开
setReporter((text) => show(text))

const showSourceDialog = ref(false)
const shopPhone = computed(() => readConfig().shop?.phone || '')

const hasFilter = computed(() => Boolean(keyword.value.trim()) || category.value !== '全部')

// 每个商品有自己的地址 /p/<id>：发到微信才有卡片，/p/<id> 这个 Function 会注入 og 标签
const BASE = import.meta.env.BASE_URL || '/'

function readProductIdFromLocation() {
  if (typeof window === 'undefined') return ''
  const match = window.location.pathname.match(/\/p\/([^/]+)\/?$/)
  if (match) return decodeURIComponent(match[1])
  return new URLSearchParams(window.location.search).get('p') || ''
}

function productUrl(id) {
  return `${window.location.origin}${BASE}p/${encodeURIComponent(id)}`
}

// 管理模式的 ?manage=1 不能被写地址栏时冲掉
function adminQuery() {
  return /(?:^|[?&])(?:manage|admin)=/.test(window.location.search) ? window.location.search : ''
}

function openProduct(product) {
  openDetail(product)
  try {
    window.history.replaceState({ product: product.id }, '', `${BASE}p/${encodeURIComponent(product.id)}${adminQuery()}`)
  } catch {
    /* 某些内嵌浏览器禁用 history，忽略即可 */
  }
}

function closeProduct() {
  closeDetail()
  try {
    window.history.replaceState({}, '', `${BASE}${adminQuery()}`)
  } catch {
    /* 同上 */
  }
}

// 从分享链接进来时，等商品列表加载完再自动打开对应商品
const pendingProductId = ref(readProductIdFromLocation())
watch(
  products,
  (list) => {
    if (!pendingProductId.value || !list.length) return
    const hit = list.find((item) => item.id === pendingProductId.value)
    if (!hit) return
    openDetail(hit)
    pendingProductId.value = ''
  },
  { immediate: true },
)

async function handleShare(product) {
  const url = productUrl(product.id)
  try {
    await navigator.clipboard.writeText(url)
    show('商品链接已复制，可直接发到微信')
  } catch {
    // 老浏览器 / 非安全上下文没有 clipboard API，退回临时文本框
    const area = document.createElement('textarea')
    area.value = url
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand?.('copy')
    document.body.removeChild(area)
    show(ok ? '商品链接已复制，可直接发到微信' : '复制失败，请长按地址栏复制链接')
  }
}

function resetFilters() {
  keyword.value = ''
  category.value = '全部'
}

function onSourceApplied() {
  showSourceDialog.value = false
  reload()
}

async function handleCall(product) {
  const phone = product?.phone || shopPhone.value
  const result = await callPhone(phone)
  if (result.ok) return
  if (result.reason === 'wechat-copied') {
    show('微信内无法直接拨号，号码已复制，请到系统拨号盘粘贴')
  } else if (result.reason === 'wechat') {
    show('微信内无法直接拨号，请到系统拨号盘手动输入')
  } else if (result.reason === 'no-phone') {
    show('该商品还没有设置联系电话')
  } else {
    show('拨号失败，请手动拨打商家电话')
  }
}
</script>

<template>
  <div class="min-h-screen bg-leaf-50 pb-6">
    <AppHeader
      :source-label="sourceLabel"
      :loading="loading"
      :admin="admin"
      @open-source="showSourceDialog = true"
      @reload="reload(true)"
      @tap-title="reportTitleTap"
    />

    <SearchBar
      v-model="keyword"
      :result-count="filtered.length"
      :total-count="counts['全部']"
    />

    <CategoryTabs v-model="category" :counts="counts" />

    <p
      v-if="error"
      class="mx-4 mt-3 rounded-2xl bg-soil-50 px-4 py-3 text-xs leading-relaxed text-soil-800 ring-1 ring-soil-200"
    >
      {{ error }}
    </p>

    <ProductGrid
      :products="filtered"
      :loading="loading"
      :has-filter="hasFilter"
      @open="openProduct"
      @call="handleCall"
      @reset="resetFilters"
    />

    <AppFooter
      :source-label="sourceLabel"
      :loading="loading"
      :admin="admin"
      @open-source="showSourceDialog = true"
      @reload="reload(true)"
    />

    <ProductDrawer
      :product="detail"
      :shop-phone="shopPhone"
      @close="closeProduct"
      @call="handleCall"
      @share="handleShare"
    />

    <WechatGuide :show="showGuide()" @close="dismiss" />

    <DataSourceDialog
      :open="showSourceDialog"
      @close="showSourceDialog = false"
      @applied="onSourceApplied"
    />

    <Toast :message="message" />
  </div>
</template>
