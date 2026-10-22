/**
 * 拨号与剪贴板工具。
 * - 普通浏览器 / App WebView：走 tel: 协议（App 内会调起系统拨号盘）
 * - 微信内置浏览器：tel: 会被拦截，自动复制号码并提示
 */
export function isWechatBrowser() {
  if (typeof navigator === 'undefined') return false
  return /micromessenger/i.test(navigator.userAgent || '')
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 继续走兜底方案 */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/**
 * 发起拨号
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function callPhone(phone) {
  const number = String(phone || '').trim()
  if (!number) return { ok: false, reason: 'no-phone' }

  if (isWechatBrowser()) {
    const copied = await copyText(number)
    return { ok: false, reason: copied ? 'wechat-copied' : 'wechat' }
  }

  try {
    // 用真实的 <a href="tel:..."> 触发：在 Android WebView 里会被
    // shouldOverrideUrlLoading 拦截并调起系统拨号盘，比 location 赋值更可靠
    const link = document.createElement('a')
    link.href = `tel:${number}`
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'dial-failed' }
  }
}
