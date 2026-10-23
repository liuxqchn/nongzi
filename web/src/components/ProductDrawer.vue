<script setup>
import { computed, watch, onUnmounted } from 'vue'
import {
  CircleAlert,
  ClipboardList,
  Droplets,
  FlaskConical,
  Phone,
  Sprout,
  Tag,
  X,
} from '@lucide/vue'
import { categoryMeta } from '../utils/categoryTheme'

const props = defineProps({
  product: { type: Object, default: null },
  shopPhone: { type: String, default: '' },
})

const emit = defineEmits(['close', 'call'])

const meta = computed(() => categoryMeta(props.product?.category))
const imageFailed = { value: false }
const cover = computed(() => props.product?.images?.[0] || '')

const rows = computed(() => {
  const p = props.product
  if (!p) return []
  return [
    { key: 'ingredients', label: '有效成分', value: p.ingredients, icon: FlaskConical },
    { key: 'crops', label: '适用作物', value: (p.crops || []).join('、'), icon: Sprout },
    { key: 'dilution', label: '稀释倍数', value: p.dilution, icon: Droplets },
    { key: 'usage', label: '用法用量', value: p.usage, icon: ClipboardList },
    { key: 'precautions', label: '注意事项', value: p.precautions, icon: CircleAlert },
  ].filter((row) => row.value)
})

const phone = computed(() => props.product?.phone || props.shopPhone || '')

watch(
  () => props.product,
  (value) => {
    document.body.classList.toggle('scroll-locked', Boolean(value))
  },
)

onUnmounted(() => {
  document.body.classList.remove('scroll-locked')
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="product"
        class="fixed inset-0 z-40 flex items-end justify-center bg-leaf-950/50 sm:items-center sm:p-6"
        @click.self="emit('close')"
      >
        <div
          class="animate-slide-up flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        >
          <!-- 头部 -->
          <div class="relative shrink-0">
            <div
              class="flex h-40 items-center justify-center bg-gradient-to-br sm:h-44"
              :class="meta.image"
            >
              <img
                v-if="cover && !imageFailed.value"
                :src="cover"
                :alt="product.name"
                decoding="async"
                class="h-full w-full object-cover"
                @error="imageFailed.value = true"
              />
              <component :is="meta.icon" v-else class="h-16 w-16 text-leaf-700/40" />
            </div>

            <button
              type="button"
              class="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-leaf-800 shadow"
              @click="emit('close')"
            >
              <X class="h-5 w-5" />
            </button>

            <span
              class="absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium"
              :class="meta.chip"
            >
              {{ product.category }}
            </span>
          </div>

          <!-- 内容 -->
          <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
            <h2 class="mt-4 text-xl font-bold leading-snug text-leaf-900">
              {{ product.name }}
            </h2>
            <p class="mt-1 text-sm text-leaf-600">
              {{ [product.brand, product.spec, product.stock].filter(Boolean).join(' · ') || '—' }}
            </p>

            <div class="mt-3 flex items-baseline gap-2">
              <span v-if="product.price !== null" class="text-2xl font-bold text-soil-700">
                ¥{{ product.price }}
              </span>
              <span v-else class="text-lg font-semibold text-leaf-600">价格面议</span>
              <span v-if="product.unit" class="text-sm text-leaf-600">/ {{ product.unit }}</span>
            </div>

            <div v-if="product.tags?.length" class="mt-3 flex flex-wrap gap-1.5">
              <span
                v-for="tag in product.tags"
                :key="tag"
                class="inline-flex items-center gap-1 rounded-md bg-leaf-50 px-2 py-1 text-xs text-leaf-700"
              >
                <Tag class="h-3 w-3" />
                {{ tag }}
              </span>
            </div>

            <dl class="mt-4 space-y-3">
              <div
                v-for="row in rows"
                :key="row.key"
                class="rounded-2xl bg-leaf-50/70 p-3"
              >
                <dt class="flex items-center gap-1.5 text-xs font-semibold text-leaf-700">
                  <component :is="row.icon" class="h-3.5 w-3.5" />
                  {{ row.label }}
                </dt>
                <dd class="mt-1 text-sm leading-relaxed text-leaf-900">{{ row.value }}</dd>
              </div>
            </dl>

            <p class="mt-4 text-[11px] leading-relaxed text-leaf-500">
              标签、用法与价格以店内实际为准，农药使用请严格按标签执行，注意安全间隔期。
            </p>
          </div>

          <!-- 底部操作条 -->
          <div class="safe-bottom shrink-0 border-t border-leaf-100 bg-white px-4 pt-3">
            <button
              type="button"
              class="flex w-full items-center justify-center gap-2 rounded-2xl bg-soil-600 py-3.5 text-base font-semibold text-white shadow-lg shadow-soil-600/25 active:bg-soil-700 disabled:opacity-50"
              :disabled="!phone"
              @click="emit('call', product)"
            >
              <Phone class="h-5 w-5" />
              {{ phone ? `拨打老板电话 ${phone}` : '暂无联系电话' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
