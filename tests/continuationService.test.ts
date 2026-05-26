import test from 'node:test'
import assert from 'node:assert/strict'
import {
  looksLikeContinuationRequest,
  buildManualContinuationPrompt,
} from '../src/services/continuationService'

test('looksLikeContinuationRequest detects 이어서', () => {
  assert.equal(looksLikeContinuationRequest('이어서 작성해줘'), true)
})

test('looksLikeContinuationRequest detects 계속', () => {
  assert.equal(looksLikeContinuationRequest('계속 써줘'), true)
})

test('looksLikeContinuationRequest detects 마저', () => {
  assert.equal(looksLikeContinuationRequest('마저 완성해주세요'), true)
})

test('looksLikeContinuationRequest returns false for unrelated requests', () => {
  assert.equal(looksLikeContinuationRequest('신규 고객 분석 보고서를 작성해줘'), false)
})

test('looksLikeContinuationRequest is robust to whitespace', () => {
  assert.equal(looksLikeContinuationRequest('이 어 서   작업 해'), true)
})

test('buildManualContinuationPrompt includes prior result', () => {
  const target = {
    id: 't1',
    title: '보고서 작성',
    result: '보고서 내용 절반...',
    threadId: undefined,
    assignedTo: [],
    status: 'completed' as const,
    createdAt: new Date(),
    description: '',
    messages: [],
  }
  const prompt = buildManualContinuationPrompt(target, '나머지 이어서 써줘')
  assert.ok(prompt.includes('[이어쓰기 요청]'))
  assert.ok(prompt.includes('보고서 내용 절반...'))
  assert.ok(prompt.includes('나머지 이어서 써줘'))
  assert.ok(prompt.includes('보고서 작성'))
})

test('buildManualContinuationPrompt handles empty result gracefully', () => {
  const target = {
    id: 't2',
    title: '분석',
    result: null,
    threadId: undefined,
    assignedTo: [],
    status: 'completed' as const,
    createdAt: new Date(),
    description: '',
    messages: [],
  }
  const prompt = buildManualContinuationPrompt(target as never, '이어줘')
  assert.ok(prompt.includes('[이전 결과 전체]'))
})
