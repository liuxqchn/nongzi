<script setup>
import { computed, ref } from 'vue'
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

const {
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
} = useCatalog()

const { message, show } = useToast()
const { showGuide, dismiss } = useWechat()

const showSourceDialog = ref(false)
const shopPhone = computed(() => readConfig().shop?.phone || '')

const hasFilter = computed(() => Boolean(keyword.value.trim()) || category.value !== '全部')

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
      @open-source="showSourceDialog = true"
      @reload="reload(true)"
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
      @open="openDetail"
      @call="handleCall"
      @reset="resetFilters"
    />

    <AppFooter
      :source-label="sourceLabel"
      :loading="loading"
      @open-source="showSourceDialog = true"
      @reload="reload(true)"
    />

    <ProductDrawer
      :product="detail"
      :shop-phone="shopPhone"
      @close="closeDetail"
      @call="handleCall"
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
