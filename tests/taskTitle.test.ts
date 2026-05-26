import test from 'node:test'
import assert from 'node:assert/strict'
import {
  summarizeTaskTitleText,
  buildTaskTitle,
  buildTriggeredTaskTitle,
  repairLegacyTaskTitle,
} from '../src/utils/taskTitle'

test('summarizeTaskTitleText returns the text as-is when short enough', () => {
  const short = '마케팅 전략 검토'
  assert.equal(summarizeTaskTitleText(short), short)
})

test('summarizeTaskTitleText truncates at sentence break when available', () => {
  const text = '전략 분석을 시작합니다. 이후 예산 편성도 검토해 주세요.'
  const result = summarizeTaskTitleText(text)
  assert.ok(result.endsWith('.'), `Expected period at end, got: ${result}`)
  assert.ok(result.length <= 80)
})

test('summarizeTaskTitleText falls back to ellipsis when no sentence break', () => {
  const text = 'a'.repeat(100)
  const result = summarizeTaskTitleText(text)
  assert.ok(result.endsWith('...'))
  assert.ok(result.length <= 80)
})

test('summarizeTaskTitleText returns empty string for blank input', () => {
  assert.equal(summarizeTaskTitleText('   '), '')
})

test('buildTaskTitle uses message when non-empty', () => {
  const result = buildTaskTitle('신규 고객 분석 보고서 작성 요청', [])
  assert.ok(result.length > 0)
  assert.ok(!result.includes('[자동]'))
})

test('buildTaskTitle falls back to single attachment name', () => {
  const result = buildTaskTitle('', [{ name: '보고서.pdf', type: 'pdf', content: '', size: 1 }])
  assert.equal(result, '보고서.pdf 분석')
})

test('buildTaskTitle falls back to multi-attachment count', () => {
  const files = [
    { name: 'a.pdf', type: 'pdf', content: '', size: 1 },
    { name: 'b.xlsx', type: 'xlsx', content: '', size: 1 },
  ]
  const result = buildTaskTitle('', files)
  assert.equal(result, '업로드 파일 2개 분석')
})

test('buildTriggeredTaskTitle prepends auto prefix', () => {
  const result = buildTriggeredTaskTitle('매일 오전 8시 보고서 작성')
  assert.ok(result.startsWith('[자동] '))
})

test('repairLegacyTaskTitle returns task unchanged when title is not a truncated prefix', () => {
  const task = {
    id: '1',
    title: '짧은 제목',
    description: '다른 내용',
    assignedTo: [] as never[],
    status: 'completed' as const,
    createdAt: new Date(),
    result: '',
    messages: [],
  }
  const result = repairLegacyTaskTitle(task)
  assert.equal(result.title, task.title)
})

test('repairLegacyTaskTitle expands legacy truncated title from description', () => {
  const shortTitle = 'a'.repeat(40)
  const fullDesc = `${shortTitle}bbbbb 이후 내용이 더 있습니다`
  const task = {
    id: '2',
    title: shortTitle,
    description: fullDesc,
    assignedTo: [] as never[],
    status: 'completed' as const,
    createdAt: new Date(),
    result: '',
    messages: [],
  }
  const result = repairLegacyTaskTitle(task)
  assert.notEqual(result.title, shortTitle)
  assert.ok(result.title.length > shortTitle.length || result.title.endsWith('...'))
})
