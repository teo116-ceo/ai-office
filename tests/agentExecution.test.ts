import test from 'node:test'
import assert from 'node:assert/strict'
import { buildThreadContext } from '../src/services/agentExecution'
import type { Task } from '../src/types'

function makeTask(overrides: Partial<Task> & { id: string; threadId?: string }): Task {
  return {
    title: '테스트 업무',
    description: '',
    status: 'completed',
    assignedTo: ['development'],
    result: '완료된 결과입니다.',
    departmentResults: [],
    approvalReasons: [],
    attachments: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as Task
}

// ─── buildThreadContext ──────────────────────────────────────────────────────

test('buildThreadContext returns empty string when no tasks match threadId', () => {
  const tasks = [makeTask({ id: 'other-thread', threadId: 'other' })]
  const ctx = buildThreadContext(tasks, 'my-thread')
  assert.equal(ctx, '')
})

test('buildThreadContext returns empty string when tasks have no result', () => {
  const tasks = [makeTask({ id: 't1', threadId: 'thread-1', result: undefined })]
  const ctx = buildThreadContext(tasks, 'thread-1')
  assert.equal(ctx, '')
})

test('buildThreadContext includes task result in context', () => {
  const tasks = [makeTask({ id: 't1', threadId: 'thread-1', result: '결과 내용' })]
  const ctx = buildThreadContext(tasks, 'thread-1')
  assert.ok(ctx.includes('결과 내용'), `expected result in context, got: ${ctx}`)
})

test('buildThreadContext includes header line', () => {
  const tasks = [makeTask({ id: 't1', threadId: 'thread-1' })]
  const ctx = buildThreadContext(tasks, 'thread-1')
  assert.ok(ctx.includes('[스레드 이전 업무'), `expected header, got: ${ctx}`)
})

test('buildThreadContext matches task whose id equals threadId (root task)', () => {
  // threadId가 없고 id === threadId인 케이스 — 스레드 루트 태스크
  const tasks = [makeTask({ id: 'root-task', threadId: undefined, result: '루트 결과' })]
  const ctx = buildThreadContext(tasks, 'root-task')
  assert.ok(ctx.includes('루트 결과'), `expected root task result, got: ${ctx}`)
})

test('buildThreadContext sorts tasks by createdAt ascending', () => {
  const tasks = [
    makeTask({ id: 't2', threadId: 'th', result: '두번째', createdAt: new Date('2026-01-02') }),
    makeTask({ id: 't1', threadId: 'th', result: '첫번째', createdAt: new Date('2026-01-01') }),
  ]
  const ctx = buildThreadContext(tasks, 'th')
  const pos1 = ctx.indexOf('첫번째')
  const pos2 = ctx.indexOf('두번째')
  assert.ok(pos1 < pos2, 'earlier task should appear first in context')
})

test('buildThreadContext truncates long results', () => {
  const longResult = 'a'.repeat(2000)
  const tasks = [makeTask({ id: 't1', threadId: 'th', result: longResult })]
  const ctx = buildThreadContext(tasks, 'th')
  // truncate()는 300자 제한 적용
  assert.ok(ctx.length < longResult.length + 200, 'context should be shorter than raw result')
})

test('buildThreadContext handles multiple thread tasks', () => {
  const tasks = [
    makeTask({ id: 't1', threadId: 'th', result: '결과1', createdAt: new Date('2026-01-01') }),
    makeTask({ id: 't2', threadId: 'th', result: '결과2', createdAt: new Date('2026-01-02') }),
    makeTask({ id: 't3', threadId: 'th', result: '결과3', createdAt: new Date('2026-01-03') }),
  ]
  const ctx = buildThreadContext(tasks, 'th')
  assert.ok(ctx.includes('총 3건'), `expected 3건, got: ${ctx}`)
})
