import { ref } from 'vue'

/**
 * 管理入口（只有供应商自己用）。
 * 商品是供应商在飞书多维表格里配的，农资店老板只是看货的顾客，
 * 所以数据源设置这类入口默认不出现在界面上。三种方式可以打开：
 *   1. 地址后面加 ?manage=1
 *   2. 连续点标题 5 下（3 秒内）
 *   3. 打开过一次以后，浏览器里会记住（localStorage）
 */
const STORAGE_KEY = 'nongzi.admin'
const TAPS_NEEDED = 5
const TAP_WINDOW = 3000

function readInitial() {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.has('manage') || params.has('admin')) return true
    if (window.location.hash === '#manage') return true
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const admin = ref(readInitial())

let taps = []
let reporter = null

/** 有变化时通知外面（用来弹提示） */
export function setReporter(fn) {
  reporter = fn
}

function persist(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, '1')
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 隐私模式下忽略 */
  }
}

export function enable() {
  if (admin.value) return
  admin.value = true
  persist(true)
  reporter?.('管理入口已开启：可在这里切换数据源')
}

export function disable() {
  admin.value = false
  persist(false)
  reporter?.('管理入口已关闭')
}

/** 连点标题：给供应商在手机上留的后门，顾客不会误触 */
export function tapTitle() {
  const now = Date.now()
  taps = [...taps.filter((t) => now - t < TAP_WINDOW), now]
  if (taps.length >= TAPS_NEEDED) {
    taps = []
    if (admin.value) disable()
    else enable()
  }
}
