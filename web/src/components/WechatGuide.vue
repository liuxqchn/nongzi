<script setup>
import { EllipsisVertical } from '@lucide/vue'

defineProps({
  show: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 animate-fade-in">
      <div class="absolute inset-0 bg-leaf-950/80"></div>

      <div
        class="absolute right-3 top-3 flex items-center gap-2 rounded-2xl bg-white/95 px-3 py-2 text-sm font-medium text-leaf-900 shadow-xl"
      >
        <span>在右上角点击</span>
        <EllipsisVertical class="h-6 w-6" />
        <span>选择「在浏览器打开」</span>
      </div>

      <div class="absolute inset-x-0 bottom-0 p-5 safe-bottom">
        <div class="mx-auto max-w-sm rounded-2xl bg-white/95 p-4 text-center shadow-xl">
          <p class="text-sm font-semibold text-leaf-900">微信里无法直接浏览商品详情</p>
          <p class="mt-1 text-xs leading-relaxed text-leaf-600">
            请点右上角「···」，选择「在浏览器打开」，即可查看商品并一键拨号。
          </p>
          <button
            type="button"
            class="mt-3 w-full rounded-xl bg-leaf-700 py-2.5 text-sm font-semibold text-white active:bg-leaf-800"
            @click="emit('close')"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
