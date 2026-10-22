<script setup>
import { SearchX } from '@lucide/vue'
import ProductCard from './ProductCard.vue'

defineProps({
  products: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  hasFilter: { type: Boolean, default: false },
})

const emit = defineEmits(['open', 'call', 'reset'])
</script>

<template>
  <div class="px-4 pb-24 pt-4">
    <!-- 骨架屏 -->
    <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <div
        v-for="n in 6"
        :key="n"
        class="overflow-hidden rounded-2xl bg-white ring-1 ring-leaf-100"
      >
        <div class="shimmer relative aspect-[4/3] bg-leaf-100"></div>
        <div class="space-y-2 p-3">
          <div class="shimmer relative h-3.5 w-full rounded bg-leaf-100"></div>
          <div class="shimmer relative h-3 w-2/3 rounded bg-leaf-50"></div>
          <div class="shimmer relative h-4 w-1/3 rounded bg-leaf-50"></div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div
      v-else-if="!products.length"
      class="flex flex-col items-center justify-center gap-3 py-20 text-center"
    >
      <div class="flex h-16 w-16 items-center justify-center rounded-full bg-leaf-100 text-leaf-500">
        <SearchX class="h-8 w-8" />
      </div>
      <p class="text-base font-semibold text-leaf-800">没有找到相关商品</p>
      <p class="text-sm text-leaf-600">换个关键词试试，或联系老板直接问货</p>
      <button
        v-if="hasFilter"
        type="button"
        class="mt-1 rounded-full bg-leaf-700 px-5 py-2 text-sm font-medium text-white active:bg-leaf-800"
        @click="emit('reset')"
      >
        清除筛选条件
      </button>
    </div>

    <!-- 商品网格 -->
    <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <ProductCard
        v-for="product in products"
        :key="product.id"
        :product="product"
        @open="emit('open', $event)"
        @call="emit('call', $event)"
      />
    </div>
  </div>
</template>
