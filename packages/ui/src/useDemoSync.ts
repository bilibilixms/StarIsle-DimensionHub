import { onMounted, onUnmounted, ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { getDemoState, setDemoRole, syncDemoState } from '@starisle/shared/demo'

export function useDemoSync(role: 'user' | 'merchant' = 'user') {
  setDemoRole(role)
  const state = ref(getDemoState())
  const syncError = ref('')
  const connected = ref(false)
  const syncing = ref(false)
  let timer: ReturnType<typeof setInterval> | undefined
  let pending: Promise<void> | undefined
  function refresh() {
    state.value = getDemoState()
  }
  function sync() {
    if (pending) return pending
    syncing.value = true
    pending = (async () => {
      try {
        state.value = await syncDemoState()
        connected.value = true
        syncError.value = ''
      } catch (error) {
        syncError.value = error instanceof Error ? error.message : '演示服务暂时无法连接'
        connected.value = false
      } finally {
        syncing.value = false
        pending = undefined
      }
    })()
    return pending
  }
  function start() {
    refresh()
    void sync()
    if (!timer)
      timer = setInterval(() => {
        void sync()
      }, 1500)
  }
  function stop() {
    if (timer) clearInterval(timer)
    timer = undefined
  }
  onMounted(start)
  onShow(start)
  onHide(stop)
  onUnload(stop)
  onUnmounted(stop)
  return { state, refresh, sync, syncError, connected, syncing }
}
