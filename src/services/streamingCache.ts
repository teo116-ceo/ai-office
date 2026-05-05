/**
 * 스트리밍 캐시 — Zustand 밖에서 실시간 스트리밍 콘텐츠를 관리
 *
 * 문제: 스트리밍 중 Zustand set()을 반복 호출하면 React 18의
 * useSyncExternalStore가 동기 업데이트를 강제해 nestedUpdateCount가
 * 50을 초과 → React Error #185 발생.
 *
 * 해결: 스트리밍 중간 콘텐츠는 모듈-레벨 Map에 보관하고,
 * requestAnimationFrame으로 throttle해 컴포넌트에 알린다.
 * 스트리밍 완료 시에만 Zustand에 최종 내용을 1회 기록한다.
 */

const contentMap = new Map<string, string>()
const listeners = new Set<() => void>()
let rafPending = false

/** 스트리밍 중: 중간 콘텐츠 저장 + rAF으로 구독자 알림 */
export function setStreamingContent(id: string, content: string): void {
  contentMap.set(id, content)
  if (!rafPending) {
    rafPending = true
    requestAnimationFrame(() => {
      rafPending = false
      listeners.forEach((fn) => fn())
    })
  }
}

/** 현재 스트리밍 캐시 콘텐츠 조회 */
export function getStreamingContent(id: string): string | undefined {
  return contentMap.get(id)
}

/** 스트리밍 완료: 캐시에서 제거 (Zustand에 최종값은 호출자가 기록) */
export function clearStreamingContent(id: string): void {
  if (contentMap.delete(id)) {
    // 마지막 rAF 한 번 더 발사해 UI가 최종 Zustand 값을 표시하게 함
    if (!rafPending) {
      rafPending = true
      requestAnimationFrame(() => {
        rafPending = false
        listeners.forEach((fn) => fn())
      })
    }
  }
}

/** 구독 등록 — 반환값은 구독 해제 함수 */
export function subscribeToStreaming(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** 현재 스트리밍 중인 메시지 ID가 있는지 확인 */
export function hasActiveStreaming(): boolean {
  return contentMap.size > 0
}
