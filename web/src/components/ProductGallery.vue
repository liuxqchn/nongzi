<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, Images, X } from '@lucide/vue'

const props = defineProps({
  images: { type: Array, default: () => [] },
  alt: { type: String, default: '' },
  // 分类主题的背景渐变与兜底图标，无图时用
  theme: { type: Object, default: () => ({}) },
})

const list = computed(() => (props.images || []).filter(Boolean))
const hasMany = computed(() => list.value.length > 1)
const index = ref(0)
const failed = ref(new Set())
const track = ref(null)
const lightboxOpen = ref(false)
const lightboxTrack = ref(null)

function usable(src) {
  return src && !failed.value.has(src)
}

function markFailed(src) {
  const next = new Set(failed.value)
  next.add(src)
  failed.value = next
}

/** 滚动时同步当前页码（缩放、快速滑动都能跟上） */
function onTrackScroll(event) {
  const el = event.target
  if (!el || !el.clientWidth) return
  const next = Math.round(el.scrollLeft / el.clientWidth)
  if (next !== index.value) index.value = Math.min(next, list.value.length - 1)
}

function goTo(target) {
  const el = track.value
  if (!el) return
  const next = Math.max(0, Math.min(target, list.value.length - 1))
  el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  index.value = next
}

function goToLightbox(target) {
  const el = lightboxTrack.value
  if (!el) return
  el.scrollTo({ left: target * el.clientWidth, behavior: 'smooth' })
}

function openLightbox() {
  if (!usable(list.value[index.value])) return
  lightboxOpen.value = true
}

function closeLightbox() {
  lightboxOpen.value = false
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    if (lightboxOpen.value) closeLightbox()
    return
  }
  if (!list.value.length) return
  if (event.key === 'ArrowLeft') (lightboxOpen.value ? stepLightbox(-1) : goTo(index.value - 1))
  if (event.key === 'ArrowRight') (lightboxOpen.value ? stepLightbox(1) : goTo(index.value + 1))
}

function stepLightbox(delta) {
  const next = Math.max(0, Math.min(index.value + delta, list.value.length - 1))
  goToLightbox(next)
  goTo(next)
}

window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// 换商品时回到第一张
watch(
  () => props.alt,
  () => {
    index.value = 0
    if (track.value) track.value.scrollLeft = 0
  },
)
</script>

<template>
  <div>
    <div class="relative">
      <!-- 没有图：保留分类主题背景 + 图标 -->
      <div
        v-if="!list.length"
        class="flex aspect-[4/3] items-center justify-center bg-gradient-to-br"
        :class="theme.image"
      >
        <component :is="theme.icon" v-if="theme.icon" class="h-16 w-16 text-leaf-700/40" />
      </div>

      <!-- 有图：横向滚动 + 吸附，手机可以直接左右滑 -->
      <div
        v-else
        ref="track"
        class="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        @scroll.passive="onTrackScroll"
      >
        <button
          v-for="(src, i) in list"
          :key="src"
          type="button"
          class="relative aspect-[4/3] w-full shrink-0 snap-center bg-gradient-to-br"
          :class="theme.image"
          :aria-label="`查看第 ${i + 1} 张大图`"
          @click="openLightbox"
        >
          <img
            v-if="usable(src)"
            :src="src"
            :alt="`${alt} 图片 ${i + 1}`"
            :loading="i === 0 ? 'eager' : 'lazy'"
            decoding="async"
            class="h-full w-full object-cover"
            @error="markFailed(src)"
          />
          <component
            :is="theme.icon"
            v-else-if="theme.icon"
            class="absolute inset-0 m-auto h-14 w-14 text-leaf-700/40"
          />
        </button>
      </div>

      <!-- 张数 / 页码：放到右下角，避开抽屉的关闭按钮 -->
      <span
        v-if="hasMany"
        class="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium text-white backdrop-blur"
      >
        {{ index + 1 }}/{{ list.length }}
      </span>
      <span
        v-else-if="list.length === 1"
        class="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/35 p-1.5 text-white backdrop-blur"
      >
        <Images class="h-3.5 w-3.5" />
      </span>

      <!-- 圆点（白图上也看得清：深色胶囊打底） -->
      <div v-if="hasMany" class="absolute inset-x-0 bottom-3 flex justify-center">
        <div class="flex items-center gap-1.5 rounded-full bg-black/35 px-2 py-1.5 backdrop-blur">
          <button
            v-for="(src, i) in list"
            :key="`dot-${src}`"
            type="button"
            class="h-1.5 rounded-full transition-all"
            :class="i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/60'"
            :aria-label="`第 ${i + 1} 张`"
            @click="goTo(i)"
          />
        </div>
      </div>
    </div>

    <!-- 缩略图条：图多的时候（药本身 / 效果 / 案例）一眼能翻 -->
    <div
      v-if="hasMany"
      class="no-scrollbar flex gap-1.5 overflow-x-auto px-3 py-2"
    >
      <button
        v-for="(src, i) in list"
        :key="`thumb-${src}`"
        type="button"
        class="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-leaf-50 ring-2 transition"
        :class="i === index ? 'ring-leaf-600' : 'ring-transparent opacity-70'"
        :aria-label="`切到第 ${i + 1} 张`"
        @click="goTo(i)"
      >
        <img :src="src" alt="" class="h-full w-full object-cover" loading="lazy" decoding="async" />
      </button>
    </div>

    <!-- 大图预览 -->
    <Teleport to="body">
      <div
        v-if="lightboxOpen"
        class="fixed inset-0 z-[60] flex flex-col bg-black/95"
        @click.self="closeLightbox"
      >
        <div class="flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <span class="text-sm text-white/80">{{ index + 1 }} / {{ list.length }}</span>
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20"
            aria-label="关闭大图"
            @click="closeLightbox"
          >
            <X class="h-5 w-5" />
          </button>
        </div>

        <div
          ref="lightboxTrack"
          class="no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto"
          @scroll.passive="onTrackScroll"
        >
          <div
            v-for="(src, i) in list"
            :key="`big-${src}`"
            class="flex w-full shrink-0 snap-center items-center justify-center px-3"
            @click.self="closeLightbox"
          >
            <img
              :src="src"
              :alt="`${alt} 大图 ${i + 1}`"
              class="max-h-full max-w-full object-contain"
              decoding="async"
              @click.self="closeLightbox"
            />
          </div>
        </div>

        <div
          v-if="hasMany"
          class="flex items-center justify-center gap-6 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3"
        >
          <button
            type="button"
            class="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-30"
            :disabled="index === 0"
            aria-label="上一张"
            @click="stepLightbox(-1)"
          >
            <ChevronLeft class="h-5 w-5" />
          </button>
          <button
            type="button"
            class="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-30"
            :disabled="index === list.length - 1"
            aria-label="下一张"
            @click="stepLightbox(1)"
          >
            <ChevronRight class="h-5 w-5" />
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
