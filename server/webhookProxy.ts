import { validateWebhookUrl } from '../src/utils/webhookValidation'

const WEBHOOK_TIMEOUT_MS = 10_000

export async function proxyWebhookRequest(rawUrl: string, payload: object) {
  const validation = validateWebhookUrl(rawUrl)
  if (validation.ok === false) {
    return { ok: false, status: 400, message: validation.message }
  }

  try {
    const response = await fetch(validation.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    })

    return {
      ok: response.ok,
      status: response.ok ? 200 : 502,
      message: response.ok ? '전송 성공' : `Webhook 응답 오류 (${response.status})`,
      upstreamStatus: response.status,
    }
  } catch (err) {
    const message = err instanceof Error && err.name === 'TimeoutError'
      ? 'Webhook 전송 시간 초과'
      : err instanceof Error
        ? err.message
        : '전송 실패'

    return {
      ok: false,
      status: 502,
      message,
    }
  }
}
