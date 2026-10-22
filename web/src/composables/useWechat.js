import { ref } from 'vue'

const FORCE_KEY = 'nongzi.forceWechat'

/**
 * 微信内置浏览器识别。
 * 微信里打开 H5 常常被劫持 / 无法唤起拨号，这里给出「在浏览器打开」的引导。
 * 调试用：地址栏加 ?wx=1 即可预览引导层。
 */
export function useWechat() {
  const dismissed = ref(false)

  function detect() {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent || ''
    if (/micromessenger/i.test(ua)) return true
    try {
      if (new URLSearchParams(window.location.search).get('wx') === '1') return true
      return localStorage.getItem(FORCE_KEY) === '1'
    } catch {
      return false
    }
  }

  const isWechat = ref(detect())

  function dismiss() {
    dismissed.value = true
  }

  return {
    isWechat,
    dismissed,
    showGuide: () => isWechat.value && !dismissed.value,
    dismiss,
  }
}
