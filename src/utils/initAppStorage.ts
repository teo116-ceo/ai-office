// React 렌더링 전 localStorage 초기화 — main.tsx에서 createRoot() 이전에 호출됨
// 버전 변경 감지 및 Electron 신규 설치 시 사용량 데이터 초기화를 담당

const APP_VERSION = import.meta.env.VITE_APP_VERSION as string | undefined ?? '1.0.59'

export function initAppStorage(): void {
  if (typeof window === 'undefined') return

  // 버전 기록 갱신 (버전 변경 감지용 — 이메일 초기화는 하지 않음)
  localStorage.setItem('ai-office-app-version', APP_VERSION)

  // Electron 신규/재설치 시에만 이메일 삭제 (버전 업데이트 시에는 유지)
  if (window.electronAPI?.isFreshInstall) {
    // 이전 사용자 이메일 잔류 방지 (새 기기 설치 or 재설치) — 업데이트 시에는 건드리지 않음
    localStorage.removeItem('ai-office-remember-email')
    localStorage.removeItem('ai-office-last-email')
  }

  // 사용량 데이터는 신규 설치 또는 버전 업데이트 모두 초기화
  // (React 렌더링 전 동기 처리 — useEffect에서 하면 Zustand 복원 후라 덮어쓰기 안 됨)
  if (window.electronAPI?.isFreshVersion) {
    // 버전 업데이트 시 테마를 warm-orange로 강제 설정
    localStorage.setItem('ai-office-theme', 'warm-orange')
    try {
      const raw = localStorage.getItem('ai-office-store')
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: { usageByProvider?: unknown } }
        if (parsed?.state) {
          const empty = { requestCount: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, lastModel: null, lastUsedAt: null }
          parsed.state.usageByProvider = { anthropic: { ...empty }, openai: { ...empty }, gemini: { ...empty } }
          localStorage.setItem('ai-office-store', JSON.stringify(parsed))
        }
      }
    } catch { /* 파싱 실패 시 무시 */ }
  }
}

export { APP_VERSION }
