<script setup>
import { reactive, watch } from 'vue'
import { Cloud, Database, HardDriveDownload, X } from '@lucide/vue'
import { readConfig, saveConfig, clearStoredConfig } from '../services/productSource'

const props = defineProps({
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'applied'])

const form = reactive({
  source: 'auto',
  appToken: '',
  tableId: '',
  token: '',
  enabled: false,
  proxy: true,
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const config = readConfig()
    form.source = config.source || 'auto'
    form.appToken = config.bitable?.appToken || ''
    form.tableId = config.bitable?.tableId || ''
    form.token = config.bitable?.token || ''
    form.enabled = Boolean(config.bitable?.enabled)
    form.proxy = config.bitable?.proxy !== false
  },
  { immediate: true },
)

const SOURCES = [
  { value: 'auto', label: '自动', desc: '优先飞书，失败自动回落到本地数据' },
  { value: 'bitable', label: '飞书多维表格', desc: '实时拉取表格内容，只读' },
  { value: 'local', label: '本地 products.json', desc: '读取站点内置的静态商品数据' },
]

function apply() {
  const config = readConfig()
  config.source = form.source
  config.bitable = {
    ...(config.bitable || {}),
    enabled: form.source === 'bitable' ? true : form.enabled,
    proxy: form.proxy,
    appToken: form.appToken.trim(),
    tableId: form.tableId.trim(),
    token: form.token.trim(),
  }
  saveConfig(config)
  emit('applied')
}

function reset() {
  clearStoredConfig()
  emit('applied')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-end justify-center bg-leaf-950/50 sm:items-center sm:p-6"
      @click.self="emit('close')"
    >
      <div
        class="animate-slide-up max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
      >
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-bold text-leaf-900">数据源设置</h3>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-full bg-leaf-50 text-leaf-700"
            @click="emit('close')"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="mt-4 space-y-2">
          <label
            v-for="item in SOURCES"
            :key="item.value"
            class="flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition"
            :class="
              form.source === item.value
                ? 'border-leaf-500 bg-leaf-50 ring-1 ring-leaf-400'
                : 'border-leaf-100 bg-white'
            "
          >
            <input
              v-model="form.source"
              type="radio"
              :value="item.value"
              class="mt-1 h-4 w-4 accent-leaf-700"
            />
            <span class="min-w-0">
              <span class="block text-sm font-semibold text-leaf-900">{{ item.label }}</span>
              <span class="block text-xs text-leaf-600">{{ item.desc }}</span>
            </span>
          </label>
        </div>

        <div class="mt-5 rounded-2xl bg-leaf-50/70 p-4">
          <p class="flex items-center gap-1.5 text-xs font-semibold text-leaf-800">
            <Cloud class="h-3.5 w-3.5" />
            飞书多维表格参数（只读）
          </p>

          <div class="mt-3 space-y-2">
            <label
              class="flex cursor-pointer items-start gap-3 rounded-xl border border-leaf-100 bg-white p-3"
            >
              <input
                v-model="form.proxy"
                :value="true"
                type="radio"
                class="mt-1 h-4 w-4 accent-leaf-700"
              />
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-leaf-900">服务端代理（推荐）</span>
                <span class="block text-xs text-leaf-600">
                  由站点的 /api/products 转发，凭证不暴露在浏览器里
                </span>
              </span>
            </label>

            <label
              class="flex cursor-pointer items-start gap-3 rounded-xl border border-leaf-100 bg-white p-3"
            >
              <input
                v-model="form.proxy"
                :value="false"
                type="radio"
                class="mt-1 h-4 w-4 accent-leaf-700"
              />
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-leaf-900">浏览器直连</span>
                <span class="block text-xs text-leaf-600">
                  浏览器直接请求飞书，需要下方令牌，且飞书需放行跨域
                </span>
              </span>
            </label>
          </div>

          <template v-if="!form.proxy">
            <label class="mt-3 block">
              <span class="text-xs text-leaf-700">App Token</span>
              <input
                v-model="form.appToken"
                type="text"
                placeholder="bascn…（多维表格链接里的 app_token）"
                class="mt-1 w-full rounded-xl border border-leaf-200 bg-white px-3 py-2 text-sm outline-none focus:border-leaf-400"
              />
            </label>

            <label class="mt-3 block">
              <span class="text-xs text-leaf-700">Table ID</span>
              <input
                v-model="form.tableId"
                type="text"
                placeholder="tbl…（表名后面的那段）"
                class="mt-1 w-full rounded-xl border border-leaf-200 bg-white px-3 py-2 text-sm outline-none focus:border-leaf-400"
              />
            </label>

            <label class="mt-3 block">
              <span class="text-xs text-leaf-700">访问令牌</span>
              <input
                v-model="form.token"
                type="password"
                placeholder="user_access_token / tenant_access_token"
                class="mt-1 w-full rounded-xl border border-leaf-200 bg-white px-3 py-2 text-sm outline-none focus:border-leaf-400"
              />
            </label>

            <p class="mt-3 text-[11px] leading-relaxed text-leaf-600">
              令牌会保存在本机浏览器（localStorage），并直接发送给飞书开放接口，仅适合只读场景。
            </p>
          </template>

          <p v-else class="mt-3 text-[11px] leading-relaxed text-leaf-600">
            代理模式下不需要在这里填任何参数：app_id / app_secret / 表格 ID 配在 Cloudflare Pages
            的环境变量里，浏览器拿不到。
          </p>
        </div>

        <div class="mt-5 flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-2xl bg-leaf-700 py-3 text-sm font-semibold text-white active:bg-leaf-800"
            @click="apply"
          >
            保存并加载
          </button>
          <button
            type="button"
            class="flex items-center gap-1 rounded-2xl bg-leaf-50 px-4 py-3 text-sm font-medium text-leaf-700 ring-1 ring-leaf-200"
            title="恢复默认配置"
            @click="reset"
          >
            <HardDriveDownload class="h-4 w-4" />
            恢复默认
          </button>
        </div>

        <p class="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-leaf-500">
          <Database class="mt-0.5 h-3 w-3 shrink-0" />
          默认数据来自站点的 products.json，可在 public/products.json 里直接编辑商品。
        </p>
      </div>
    </div>
  </Teleport>
</template>
