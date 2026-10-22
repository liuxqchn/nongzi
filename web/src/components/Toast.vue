<script setup>
defineProps({
  message: { type: String, default: '' },
})
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="message"
        class="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-6"
      >
        <div
          class="pointer-events-auto max-w-sm rounded-2xl bg-leaf-900/95 px-4 py-3 text-center text-sm font-medium text-white shadow-xl"
        >
          {{ message }}
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
