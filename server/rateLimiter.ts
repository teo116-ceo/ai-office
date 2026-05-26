// Sliding window rate limiter — 타임스탬프 배열로 구현
// Fixed window 방식의 경계 burst 문제 해결:
//   Fixed: 59초에 60회 + 61초에 60회 = 2초에 120회 가능
//   Sliding: 임의의 windowMs 구간에서 항상 max회 이하 보장

const timestamps = new Map<string, number[]>()

// 오래된 엔트리 주기 정리 (메모리 누수 방지)
// unref()로 이벤트 루프를 붙잡지 않아 테스트/종료 시 자연히 해제
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000
  for (const [key, ts] of timestamps) {
    if (ts.length === 0 || ts[ts.length - 1] < cutoff) timestamps.delete(key)
  }
}, 10 * 60 * 1000).unref()

/**
 * Returns true if the key is within the allowed rate.
 * @param key      — unique identifier (e.g. IP address, session token)
 * @param max      — max requests allowed in the window
 * @param windowMs — sliding window length in milliseconds
 */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const cutoff = now - windowMs

  const ts = timestamps.get(key) ?? []
  // 윈도우 밖의 오래된 타임스탬프 제거
  const recent = ts.filter((t) => t > cutoff)

  if (recent.length >= max) {
    timestamps.set(key, recent)
    return false
  }

  recent.push(now)
  timestamps.set(key, recent)
  return true
}

export function resetRateLimit(key: string): void {
  timestamps.delete(key)
}
