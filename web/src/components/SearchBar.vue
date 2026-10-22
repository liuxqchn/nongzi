<script setup>
import { Search, X } from '@lucide/vue'

defineProps({
  modelValue: { type: String, default: '' },
  resultCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
})

const emit = defineEmits(['update:modelValue', 'clear'])
</script>

<template>
  <div class="px-4 pt-4">
    <div class="relative">
      <Search class="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-leaf-500" />
      <input
        :value="modelValue"
        type="search"
        inputmode="search"
        enterkeyhint="search"
        placeholder="搜商品名 / 品牌 / 成分，支持拼音首字母"
        class="w-full rounded-2xl border border-leaf-200 bg-white py-3 pl-11 pr-11 text-[15px] text-leaf-900 shadow-sm outline-none placeholder:text-leaf-400 focus:border-leaf-400 focus:ring-2 focus:ring-leaf-200"
        @input="emit('update:modelValue', $event.target.value)"
      />
      <button
        v-if="modelValue"
        type="button"
        class="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-leaf-100 text-leaf-700"
        @click="emit('update:modelValue', ''); emit('clear')"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <p class="mt-2 text-xs text-leaf-600">
      <template v-if="modelValue">
        找到 <span class="font-semibold text-leaf-800">{{ resultCount }}</span> 个商品（全部
        {{ totalCount }} 个）
      </template>
      <template v-else> 共 {{ totalCount }} 个商品，点击卡片看成分与用法用量 </template>
    </p>
  </div>
</template>
