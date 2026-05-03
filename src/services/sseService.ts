import { useAgentStore } from '@/store/agentStore'
import { getSessionToken } from '@/services/sessionService'
import { formatSystemDisplayName } from '@/utils/agentRoleMeta'

let eventSource: EventSource | null = null

interface BriefingEvent { result: string; triggeredAt: string }
interface FileSavedEvent { filename: string; size: number; savedAt: string }

export function connectSSE(): () => void {
  if (eventSource) eventSource.close()

  // EventSource는 커스텀 헤더를 지원하지 않으므로 query param으로 세션 토큰 전달
  const token = getSessionToken()
  const url = token ? `/api/events?token=${encodeURIComponent(token)}` : '/api/events'
  eventSource = new EventSource(url)

  let wasDisconnected = false

  eventSource.addEventListener('connected', () => {
    if (wasDisconnected) {
      wasDisconnected = false
      useAgentStore.getState().addToast('success', '서버 재연결 완료', undefined, 3000)
    }
  })

  // 스케줄러 자동 브리핑 결과 → 채팅 패널에 표시
  eventSource.addEventListener('briefing', (e: MessageEvent<string>) => {
    let data: BriefingEvent
    try {
      data = JSON.parse(e.data) as BriefingEvent
    } catch {
      console.warn('[SSE] briefing 이벤트 파싱 실패:', e.data)
      return
    }
    const store = useAgentStore.getState()
    const ceoAgent = store.agents.find((a) => a.departmentId === 'ceo')
    store.addMessage({
      sender: ceoAgent?.id ?? 'system',
      senderName: ceoAgent ? formatSystemDisplayName('대표실', '자동 브리핑') : formatSystemDisplayName('시스템', '자동 브리핑'),
      content: data.result,
      type: 'result',
    })
    store.addToast('info', '자동 브리핑 수신', new Date(data.triggeredAt).toLocaleTimeString('ko-KR'), 5000)
  })

  // 에이전트 파일 저장 알림
  eventSource.addEventListener('file-saved', (e: MessageEvent<string>) => {
    let data: FileSavedEvent
    try {
      data = JSON.parse(e.data) as FileSavedEvent
    } catch {
      console.warn('[SSE] file-saved 이벤트 파싱 실패:', e.data)
      return
    }
    const store = useAgentStore.getState()
    store.addMessage({
      sender: 'system',
      senderName: formatSystemDisplayName('시스템', '파일 저장'),
      content: `📁 에이전트가 파일을 저장했습니다: **${data.filename}** (${(data.size / 1024).toFixed(1)}KB)`,
      type: 'system',
    })
    store.addToast('success', '파일 저장됨', data.filename, 4000)
  })

  eventSource.onerror = () => {
    if (!wasDisconnected) {
      wasDisconnected = true
      useAgentStore.getState().addToast('warn', '서버 연결 끊김', '자동으로 재연결을 시도합니다.', 5000)
    }
  }

  return () => {
    eventSource?.close()
    eventSource = null
  }
}

export function disconnectSSE() {
  eventSource?.close()
  eventSource = null
}
