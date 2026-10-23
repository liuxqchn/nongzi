<script setup>
import { computed, ref } from 'vue'
import { Images, Phone } from '@lucide/vue'
import { categoryMeta } from '../utils/categoryTheme'

const props = defineProps({
  product: { type: Object, required: true },
})

const emit = defineEmits(['open', 'call'])

const imageFailed = ref(false)
const imageLoaded = ref(false)

const meta = computed(() => categoryMeta(props.product.category))
const cover = computed(() => props.product.images?.[0] || '')
const showImage = computed(() => cover.value && !imageFailed.value)

function onImageError() {
  imageFailed.value = true
}
</script>

<template>
  <article
    class="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-leaf-100 transition active:scale-[0.99]"
    @click="emit('open', product)"
  >
    <div
      class="relative flex aspect-[4/3] items-center justify-center bg-gradient-to-br"
      :class="meta.image"
    >
      <!-- 懒加载：图片来自飞书表格附件，由 /api/media 代理并做边缘缓存 -->
      <img
        v-if="showImage"
        :src="cover"
        :alt="product.name"
        loading="lazy"
        decoding="async"
        class="h-full w-full object-cover transition-opacity duration-300"
        :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
        @load="imageLoaded = true"
        @error="onImageError"
      />
      <component :is="meta.icon" v-else class="h-12 w-12 text-leaf-700/40" />

      <span
        class="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium"
        :class="meta.chip"
      >
        {{ product.category }}
      </span>

      <!-- 图集张数：提示点开还能看效果图/案例图 -->
      <span
        v-if="showImage && product.images.length > 1"
        class="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur"
      >
        <Images class="h-3 w-3" />
        {{ product.images.length }}
      </span>

      <button
        v-if="product.phone"
        type="button"
        class="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-soil-600 shadow-sm ring-1 ring-black/5 active:bg-white"
        title="拨打老板电话"
        @click.stop="emit('call', product)"
      >
        <Phone class="h-4 w-4" />
      </button>
    </div>

    <div class="flex flex-1 flex-col gap-1.5 p-3">
      <h3 class="line-clamp-2 text-sm font-semibold leading-snug text-leaf-900">
        {{ product.name }}
      </h3>

      <p class="truncate text-xs text-leaf-600">
        {{ [product.brand, product.spec].filter(Boolean).join(' · ') || '—' }}
      </p>

      <div class="mt-auto flex items-end justify-between gap-2 pt-1">
        <p class="text-soil-700">
          <span
            v-if="product.price !== null"
            class="text-lg font-bold leading-none tracking-tight"
          >
            ¥{{ product.price }}
          </span>
          <span v-else class="text-sm text-leaf-500">价格面议</span>
          <span v-if="product.unit" class="ml-0.5 text-xs text-leaf-600">/{{ product.unit }}</span>
        </p>
        <span
          v-if="product.stock"
          class="rounded-md bg-leaf-50 px-1.5 py-0.5 text-[11px] text-leaf-600"
        >
          {{ product.stock }}
        </span>
      </div>
    </div>
  </article>
</template>
