import test from 'node:test'
import assert from 'node:assert/strict'
import {
  estimateCostUsd,
  beginTaskTokenTracking,
  finishTaskTokenTracking,
} from '../src/services/multiProviderApi'

// ─── estimateCostUsd ────────────────────────────────────────────────────────

test('estimateCostUsd returns 0 for zero tokens', () => {
  const cost = estimateCostUsd('claude-sonnet-4-6', 0, 0)
  assert.equal(cost, 0)
})

test('estimateCostUsd calculates correctly for claude-sonnet-4-6 (in=$3, out=$15 per 1M)', () => {
  // 1,000,000 input + 1,000,000 output = $3 + $15 = $18
  const cost = estimateCostUsd('claude-sonnet-4-6', 1_000_000, 1_000_000)
  assert.equal(cost, 18)
})

test('estimateCostUsd calculates correctly for gpt-4o-mini (in=$0.15, out=$0.6 per 1M)', () => {
  // 1,000 input + 1,000 output = $0.00015 + $0.0006 = $0.00075
  const cost = estimateCostUsd('gpt-4o-mini', 1_000, 1_000)
  assert.ok(Math.abs(cost - 0.00075) < 1e-10, `expected ~0.00075 got ${cost}`)
})

test('estimateCostUsd uses fallback pricing for unknown model (in=$3, out=$15)', () => {
  // unknown model → fallback { in: 3, out: 15 }
  const cost = estimateCostUsd('unknown-model-xyz', 1_000_000, 0)
  assert.equal(cost, 3)
})

test('estimateCostUsd only counts output for output-only call', () => {
  // claude-haiku-4-5: out=$4 per 1M
  const cost = estimateCostUsd('claude-haiku-4-5-20251001', 0, 1_000_000)
  assert.equal(cost, 4)
})

// ─── 태스크별 토큰 추적 라이프사이클 ────────────────────────────────────────

test('finishTaskTokenTracking returns null for never-tracked task', () => {
  const result = finishTaskTokenTracking('no-such-task-id')
  assert.equal(result, null)
})

test('beginTaskTokenTracking initialises counters to zero', () => {
  const taskId = 'test-task-init'
  beginTaskTokenTracking(taskId)
  const result = finishTaskTokenTracking(taskId)
  assert.ok(result !== null)
  assert.equal(result.inputTokens, 0)
  assert.equal(result.outputTokens, 0)
  assert.equal(result.estimatedCostUsd, 0)
})

test('finishTaskTokenTracking removes entry — second call returns null', () => {
  const taskId = 'test-task-cleanup'
  beginTaskTokenTracking(taskId)
  finishTaskTokenTracking(taskId)
  const second = finishTaskTokenTracking(taskId)
  assert.equal(second, null)
})

test('beginTaskTokenTracking resets counters if called twice on same id', () => {
  const taskId = 'test-task-reset'
  beginTaskTokenTracking(taskId)
  // Simulate that tokens were accumulated somehow — then reset by a second begin
  beginTaskTokenTracking(taskId)
  const result = finishTaskTokenTracking(taskId)
  assert.ok(result !== null)
  assert.equal(result.inputTokens, 0)
  assert.equal(result.outputTokens, 0)
})

test('concurrent task tracking is independent', () => {
  const idA = 'concurrent-task-a'
  const idB = 'concurrent-task-b'
  beginTaskTokenTracking(idA)
  beginTaskTokenTracking(idB)

  const a = finishTaskTokenTracking(idA)
  const b = finishTaskTokenTracking(idB)

  assert.ok(a !== null)
  assert.ok(b !== null)
  // Both start at zero — finishing A should not affect B
  assert.equal(b.inputTokens, 0)
})
