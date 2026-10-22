<script setup>
import { CATEGORIES } from '../data/categories'

defineProps({
  modelValue: { type: String, default: '全部' },
  counts: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <nav class="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
    <button
      v-for="item in CATEGORIES"
      :key="item"
      type="button"
      class="shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors"
      :class="
        modelValue === item
          ? 'bg-leaf-700 text-white shadow-md shadow-leaf-900/15'
          : 'bg-white text-leaf-700 ring-1 ring-leaf-200 active:bg-leaf-100'
      "
      @click="emit('update:modelValue', item)"
    >
      {{ item }}
      <span
        v-if="counts[item] !== undefined"
        class="ml-1 text-[11px] opacity-70"
        :class="modelValue === item ? 'text-leaf-100' : 'text-leaf-500'"
      >
        {{ counts[item] }}
      </span>
    </button>
  </nav>
</template>
