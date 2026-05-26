import test from 'node:test'
import assert from 'node:assert/strict'
import { getProvider, normalizeMaxTokens } from '../server/llmUtils'

// ── getProvider ──────────────────────────────────────────────────────────────

test('getProvider returns anthropic for claude- models', () => {
  assert.equal(getProvider('claude-sonnet-4-6'), 'anthropic')
  assert.equal(getProvider('claude-opus-4-7'), 'anthropic')
})

test('getProvider returns openai for gpt- models', () => {
  assert.equal(getProvider('gpt-4o'), 'openai')
  assert.equal(getProvider('gpt-4o-mini'), 'openai')
})

test('getProvider returns gemini for anything else', () => {
  assert.equal(getProvider('gemini-2.5-pro'), 'gemini')
  assert.equal(getProvider('gemini-2.5-flash'), 'gemini')
  assert.equal(getProvider('unknown-model'), 'gemini')
})

// ── normalizeMaxTokens ────────────────────────────────────────────────────────

test('normalizeMaxTokens clamps to MAX_TOKENS_LIMIT (100000)', () => {
  assert.equal(normalizeMaxTokens('any-model', 200_000), 100_000)
})

test('normalizeMaxTokens returns the requested value when within limit', () => {
  assert.equal(normalizeMaxTokens('any-model', 8_000), 8_000)
})

test('normalizeMaxTokens falls back to 8000 for invalid input', () => {
  assert.equal(normalizeMaxTokens('any-model', 0), 8_000)
  assert.equal(normalizeMaxTokens('any-model', -1), 8_000)
  assert.equal(normalizeMaxTokens('any-model', NaN), 8_000)
  assert.equal(normalizeMaxTokens('any-model', Infinity), 8_000)
})
