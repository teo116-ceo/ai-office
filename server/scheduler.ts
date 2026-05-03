import cron from 'node-cron'

export interface ServerSchedulerSettings {
  enabled: boolean
  hour: number
  minute: number
}

let currentTask: ReturnType<typeof cron.schedule> | null = null
let briefingCallback: (() => Promise<void>) | null = null

export function registerBriefingCallback(cb: () => Promise<void>) {
  briefingCallback = cb
}

export function applyServerScheduler(settings: ServerSchedulerSettings) {
  if (currentTask) {
    currentTask.stop()
    currentTask = null
  }

  if (!settings.enabled) {
    console.log('[scheduler] 비활성화')
    return
  }

  const expression = `${settings.minute} ${settings.hour} * * *`

  try {
    currentTask = cron.schedule(expression, () => {
      console.log('[scheduler] 일일 브리핑 실행:', new Date().toLocaleString('ko-KR'))
      briefingCallback?.().catch((err) => console.error('[scheduler] 브리핑 실패:', err))
    })
    console.log(`[scheduler] 활성화 — 매일 ${settings.hour}시 ${String(settings.minute).padStart(2, '0')}분`)
  } catch (err) {
    console.error('[scheduler] cron 표현식 오류:', expression, err)
  }
}

export function stopServerScheduler() {
  if (currentTask) {
    currentTask.stop()
    currentTask = null
  }
}
