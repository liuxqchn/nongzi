<script setup>
import { onMounted, ref } from 'vue'
import { Database, Download, RotateCw } from '@lucide/vue'

defineProps({
  sourceLabel: { type: String, default: '' },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['open-source', 'reload'])

// 站点根目录下放了 app-release.apk 才显示「下载 App」入口
const apkUrl = ref('')

onMounted(async () => {
  const base = import.meta.env.BASE_URL || '/'
  const url = `${base}app-release.apk`.replace(/\/{2,}/g, '/')
  try {
    const response = await fetch(url, { method: 'HEAD' })
    if (!response.ok) return
    // 静态托管的 SPA 回退会把不存在的路径也返回 200 的 index.html，
    // 所以必须确认响应确实是 APK 而不是 HTML
    const type = (response.headers.get('content-type') || '').toLowerCase()
    if (type.includes('text/html') || type.includes('application/json')) return
    const length = Number(response.headers.get('content-length') || 0)
    if (length && length < 100000) return
    apkUrl.value = url
  } catch {
    // 没放 APK 时忽略，页面照常展示
  }
})
</script>

<template>
  <footer class="border-t border-leaf-100 bg-white/70 px-4 py-6 text-center">
    <div class="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full bg-leaf-50 px-3 py-1.5 text-xs font-medium text-leaf-700 ring-1 ring-leaf-100 active:bg-leaf-100"
        @click="emit('open-source')"
      >
        <Database class="h-3.5 w-3.5" />
        数据源：{{ sourceLabel }}
      </button>

      <a
        v-if="apkUrl"
        :href="apkUrl"
        download="农资目录.apk"
        class="inline-flex items-center gap-1.5 rounded-full bg-leaf-600 px-3 py-1.5 text-xs font-medium text-white active:bg-leaf-700"
      >
        <Download class="h-3.5 w-3.5" />
        下载 App
      </a>
    </div>

    <p class="mt-3 text-[11px] text-leaf-500">
      农药使用请以产品标签为准，严格遵守剂量与安全间隔期
    </p>

    <button
      type="button"
      class="mt-2 inline-flex items-center gap-1 text-[11px] text-leaf-500 underline-offset-2 hover:underline"
      @click="emit('reload')"
    >
      <RotateCw class="h-3 w-3" :class="loading ? 'animate-spin' : ''" />
      重新加载商品
    </button>
  </footer>
</template>
