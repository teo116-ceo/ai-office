import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCoordinatorMessage,
  looksLikeMeetingSummon,
  resolveByKeyword,
  resolveKeywordRouting,
  resolveMeetingPlan,
} from '../src/services/taskRouting'

test('explicit department mention wins over inferred keywords', () => {
  const result = resolveKeywordRouting('@연구 창업자 진단 리포트 자동화를 개발팀과 검토해줘')
  assert.deepEqual(result.explicitlyMentioned, ['security'])
  assert.deepEqual(result.inferred, ['compliance', 'development', 'presales'])
})

test('keyword routing falls back to core Ji-eum departments when nothing matches', () => {
  assert.deepEqual(resolveByKeyword('이번 요청을 검토해주세요'), ['planning', 'security', 'compliance', 'sales'])
})

test('meeting summon ignores question-like prompts', () => {
  assert.equal(looksLikeMeetingSummon('대회의실에 모여도 되나요?'), false)
})

test('meeting summon detects imperative prompts', () => {
  assert.equal(looksLikeMeetingSummon('중회의실로 모여서 검토해'), true)
})

test('large meeting includes all departments', () => {
  const plan = resolveMeetingPlan('대회의실로 전부 모여서 회의해', '8f')
  assert.ok(plan)
  assert.equal(plan?.room, 'large')
  assert.ok((plan?.departmentIds.length ?? 0) > 10)
})

test('small meeting uses current floor departments when message is generic', () => {
  const plan = resolveMeetingPlan('소회의실로 모여서 회의해', '7f')
  assert.deepEqual(plan?.departmentIds, ['qa', 'devops'])
})

test('coordinator message summarizes attachment count', () => {
  const message = buildCoordinatorMessage(['security', 'development'], 2, null)
  assert.match(message, /배정된 부서: R&D 관리, 자동화개발/)
  assert.match(message, /첨부 파일: 2개/)
})

test('meeting completion phrasing clears meeting directives', async () => {
  const originalLocalStorage = globalThis.localStorage

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem() { return null },
      setItem() {},
      removeItem() {},
      clear() {},
      key() { return null },
      length: 0,
    },
  })

  try {
    const { resolveDirectiveCommand } = await import('../src/services/directives')

    for (const message of ['회의를 마치도록 하겠습니다', '회의 마무리할게요']) {
      const result = resolveDirectiveCommand(message, [], null)
      assert.equal(result?.action, 'clear')
      assert.equal(result?.kind, 'meeting')
    }
  } finally {
    if (originalLocalStorage === undefined) {
      delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      })
    }
  }
})
