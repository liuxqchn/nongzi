import { ref } from 'vue'

const message = ref('')
let timer = null

export function useToast() {
  function show(text, duration = 2400) {
    message.value = text
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      message.value = ''
    }, duration)
  }

  function hide() {
    message.value = ''
    if (timer) clearTimeout(timer)
  }

  return { message, show, hide }
}
