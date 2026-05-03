// Simple in-memory rate limiter — no external dependencies needed

interface Bucket {
  count: number
  windowStart: number
}

const buckets = new Map<string, Bucket>()

// 만료된 버킷 주기 정리 (메모리 누수 방지)
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > 60 * 60 * 1000) buckets.delete(key)
  }
}, 10 * 60 * 1000)

/**
 * Returns true if the key is within the allowed rate.
 * @param key      — unique identifier (e.g. IP address, session token)
 * @param max      — max requests allowed in the window
 * @param windowMs — sliding window length in milliseconds
 */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now })
    return true
  }

  if (bucket.count >= max) return false

  bucket.count++
  return true
}

export function resetRateLimit(key: string): void {
  buckets.delete(key)
}
