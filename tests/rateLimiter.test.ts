import test from 'node:test'
import assert from 'node:assert/strict'
import { checkRateLimit } from '../server/rateLimiter'

test('allows requests within the limit', () => {
  const key = 'test:within-limit'
  for (let i = 0; i < 5; i++) {
    assert.equal(checkRateLimit(key, 5, 60_000), true)
  }
})

test('blocks the request that exceeds the limit', () => {
  const key = 'test:exceeds-limit'
  for (let i = 0; i < 5; i++) checkRateLimit(key, 5, 60_000)
  assert.equal(checkRateLimit(key, 5, 60_000), false)
})

test('uses separate counters per key', () => {
  const keyA = 'test:separate-a'
  const keyB = 'test:separate-b'
  for (let i = 0; i < 3; i++) checkRateLimit(keyA, 3, 60_000)
  assert.equal(checkRateLimit(keyA, 3, 60_000), false)
  assert.equal(checkRateLimit(keyB, 3, 60_000), true)
})

test('expired timestamps are not counted (sliding window)', () => {
  // A 0 ms window means every timestamp is immediately expired on the next
  // call (cutoff = Date.now() - 0 = Date.now(), all stored ts <= Date.now()
  // so none pass the t > cutoff filter).
  const key = 'test:sliding-zero-window'
  for (let i = 0; i < 5; i++) {
    assert.equal(checkRateLimit(key, 1, 0), true, `call ${i} should pass — all prior ts are expired`)
  }
})

test('zero-limit key is always blocked', () => {
  const key = 'test:zero-limit'
  assert.equal(checkRateLimit(key, 0, 60_000), false)
})
