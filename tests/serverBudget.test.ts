import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkServerBudget,
  recordServerUsage,
  getServerBudgetStatus,
} from '../server/serverBudget'

test('checkServerBudget always allows when no limit is configured', () => {
  delete process.env.SERVER_DAILY_TOKEN_LIMIT
  assert.equal(checkServerBudget(999_999_999), true)
})

test('getServerBudgetStatus returns limit=0 when env var is absent', () => {
  delete process.env.SERVER_DAILY_TOKEN_LIMIT
  const status = getServerBudgetStatus()
  assert.equal(status.limit, 0)
  assert.equal(typeof status.used, 'number')
  assert.ok(status.date.match(/^\d{4}-\d{2}-\d{2}$/))
})

test('recordServerUsage accumulates and getServerBudgetStatus reflects it', () => {
  delete process.env.SERVER_DAILY_TOKEN_LIMIT
  const before = getServerBudgetStatus().used
  recordServerUsage(500)
  const after = getServerBudgetStatus().used
  assert.equal(after, before + 500)
})

test('checkServerBudget allows when usage is within limit', () => {
  process.env.SERVER_DAILY_TOKEN_LIMIT = '999999999'
  assert.equal(checkServerBudget(100), true)
  delete process.env.SERVER_DAILY_TOKEN_LIMIT
})

test('checkServerBudget blocks when adding tokens would exceed limit', () => {
  const current = getServerBudgetStatus().used
  // Set the limit to exactly what is already used — next call should be blocked
  process.env.SERVER_DAILY_TOKEN_LIMIT = String(current)
  assert.equal(checkServerBudget(1), false)
  delete process.env.SERVER_DAILY_TOKEN_LIMIT
})
