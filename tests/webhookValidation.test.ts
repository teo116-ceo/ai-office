import test from 'node:test'
import assert from 'node:assert/strict'
import { validateWebhookUrl } from '../src/utils/webhookValidation'

test('Slack webhook URL is accepted', () => {
  const result = validateWebhookUrl('https://hooks.slack.com/services/T000/B000/XXXX')
  assert.equal(result.ok, true)
})

test('Discord webhook URL is accepted', () => {
  const result = validateWebhookUrl('https://discord.com/api/webhooks/123/abc')
  assert.equal(result.ok, true)
})

test('localhost webhook URL is accepted for development', () => {
  const result = validateWebhookUrl('http://localhost:3001/test-webhook')
  assert.equal(result.ok, true)
})

test('custom https host is accepted', () => {
  const result = validateWebhookUrl('https://example.com/webhook')
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.kind, 'custom')
  }
})

test('Slack webhook without services path is rejected', () => {
  const result = validateWebhookUrl('https://hooks.slack.com/not-services')
  assert.deepEqual(result, {
    ok: false,
    message: 'Slack 웹훅 경로가 올바르지 않습니다 (/services/로 시작해야 합니다).',
  })
})

test('external http webhook is rejected', () => {
  const result = validateWebhookUrl('http://hooks.slack.com/services/T000/B000/XXXX')
  assert.deepEqual(result, {
    ok: false,
    message: '외부 웹훅은 https URL만 허용됩니다.',
  })
})
