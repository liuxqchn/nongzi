<script setup>
import { computed, onMounted, ref } from 'vue'
import { Download, RefreshCw, Store } from '@lucide/vue'
import { readConfig } from '../services/productSource'

const props = defineProps({
  sourceLabel: { type: String, default: '' },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['open-source', 'reload'])

const config = readConfig()
const shop = computed(() => config.shop || {})
const apkReady = ref(false)

const APK_URL = `${import.meta.env.BASE_URL || '/'}app-release.apk`.replace(/\/{2,}/g, '/')

onMounted(async () => {
  try {
    const response = await fetch(APK_URL, { method: 'HEAD' })
    const size = Number(response.headers.get('content-length') || 0)
    // 只有真正放进去的 APK（大于 500KB）才显示下载入口
    apkReady.value = response.ok && size > 500_000
  } catch {
    apkReady.value = false
  }
})
</script>

<template>
  <header class="sticky top-0 z-30 bg-leaf-700 text-white shadow-lg shadow-leaf-900/10">
    <div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 safe-top">
      <div
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25"
      >
        <Store class="h-6 w-6" />
      </div>

      <div class="min-w-0 flex-1">
        <h1 class="truncate text-lg font-bold leading-tight">
          {{ shop.name || '农资商品目录' }}
        </h1>
        <p class="truncate text-xs text-leaf-100/90">
          {{ shop.subtitle || '扫码看成分 · 查用法 · 一键问价' }}
        </p>
      </div>

      <a
        v-if="apkReady"
        :href="APK_URL"
        download
        class="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-xs font-medium ring-1 ring-white/25 active:bg-white/25"
      >
        <Download class="h-4 w-4" />
        下载 App
      </a>

      <button
        type="button"
        class="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25 active:bg-white/25"
        title="切换数据源"
        @click="emit('open-source')"
      >
        <RefreshCw class="h-5 w-5" :class="props.loading ? 'animate-spin' : ''" />
      </button>
    </div>
  </header>
</template>
