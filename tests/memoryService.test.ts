import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMemoryContext } from '../src/services/memoryService'
import type { AgentMemory } from '../src/types'

function makeMemory(overrides: Partial<AgentMemory> = {}): AgentMemory {
  return {
    id: 'mem-1',
    taskId: 'task-1',
    title: '샘플 업무',
    summary: '이것은 테스트용 메모리 요약입니다.',
    keyPoints: ['핵심 포인트 A', '핵심 포인트 B'],
    departments: ['ceo'],
    tags: ['테스트'],
    importance: 0.7,
    accessCount: 0,
    createdAt: new Date(),
    ...overrides,
  }
}

test('buildMemoryContext returns empty string for no memories', () => {
  assert.equal(buildMemoryContext([]), '')
})

test('buildMemoryContext wraps content with header and footer', () => {
  const result = buildMemoryContext([makeMemory()])
  assert.ok(result.includes('[과거 업무 참고]'), 'missing header')
  assert.ok(result.includes('[과거 업무 참고 끝]'), 'missing footer')
})

test('buildMemoryContext includes the memory title', () => {
  const result = buildMemoryContext([makeMemory({ title: '마케팅 캠페인 결과' })])
  assert.ok(result.includes('마케팅 캠페인 결과'))
})

test('buildMemoryContext includes the summary', () => {
  const mem = makeMemory({ summary: '분기 매출이 20% 증가했습니다.' })
  const result = buildMemoryContext([mem])
  assert.ok(result.includes('분기 매출이 20% 증가했습니다.'))
})

test('buildMemoryContext includes keyPoints as bullet lines', () => {
  const mem = makeMemory({ keyPoints: ['포인트 1', '포인트 2'] })
  const result = buildMemoryContext([mem])
  assert.ok(result.includes('- 포인트 1'))
  assert.ok(result.includes('- 포인트 2'))
})

test('buildMemoryContext includes outcome when present', () => {
  const mem = makeMemory({ outcome: '최종 결론: 전략 변경 필요' })
  const result = buildMemoryContext([mem])
  assert.ok(result.includes('결과: 최종 결론: 전략 변경 필요'))
})

test('buildMemoryContext handles multiple memories', () => {
  const memories = [
    makeMemory({ id: 'a', title: '업무 A' }),
    makeMemory({ id: 'b', title: '업무 B' }),
  ]
  const result = buildMemoryContext(memories)
  assert.ok(result.includes('업무 A'))
  assert.ok(result.includes('업무 B'))
})

test('buildMemoryContext shows "오늘" for memories created today', () => {
  const result = buildMemoryContext([makeMemory({ createdAt: new Date() })])
  assert.ok(result.includes('오늘'))
})
