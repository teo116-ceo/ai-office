const SLACK_HOSTS = new Set(['hooks.slack.com', 'hooks.slack-gov.com'])
const DISCORD_SUFFIXES = ['.discord.com', '.discordapp.com']
const DISCORD_HOSTS = new Set(['discord.com', 'discordapp.com'])

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

const BLOCKED_PREFIXES = [
  '10.', '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.', '172.24.',
  '172.25.', '172.26.', '172.27.', '172.28.', '172.29.',
  '172.30.', '172.31.', '192.168.', '169.254.',
]

export interface WebhookValidationSuccess {
  ok: true
  url: URL
  kind: 'slack' | 'discord' | 'custom' | 'local'
}

export interface WebhookValidationFailure {
  ok: false
  message: string
}

export type WebhookValidationResult = WebhookValidationSuccess | WebhookValidationFailure

function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname)
}

function isBlockedPrivateIp(hostname: string): boolean {
  return BLOCKED_PREFIXES.some((prefix) => hostname.startsWith(prefix))
}

function isSlackHost(hostname: string): boolean {
  return SLACK_HOSTS.has(hostname)
}

function isDiscordHost(hostname: string): boolean {
  return DISCORD_HOSTS.has(hostname) || DISCORD_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
}

export function validateWebhookUrl(rawUrl: string): WebhookValidationResult {
  if (!rawUrl.trim()) {
    return { ok: false, message: 'URL을 입력하세요.' }
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, message: '유효한 URL을 입력하세요.' }
  }

  const hostname = parsed.hostname.toLowerCase()

  if (!['https:', 'http:'].includes(parsed.protocol)) {
    return { ok: false, message: 'http 또는 https URL만 사용할 수 있습니다.' }
  }

  if (isLocalHost(hostname)) {
    return { ok: true, url: parsed, kind: 'local' }
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, message: '외부 웹훅은 https URL만 허용됩니다.' }
  }

  if (isBlockedPrivateIp(hostname)) {
    return { ok: false, message: '사설 네트워크 주소로는 웹훅을 보낼 수 없습니다.' }
  }

  if (isSlackHost(hostname)) {
    if (!parsed.pathname.startsWith('/services/')) {
      return { ok: false, message: 'Slack 웹훅 경로가 올바르지 않습니다 (/services/로 시작해야 합니다).' }
    }
    return { ok: true, url: parsed, kind: 'slack' }
  }

  if (isDiscordHost(hostname)) {
    if (!parsed.pathname.includes('/webhooks/')) {
      return { ok: false, message: 'Discord 웹훅 경로가 올바르지 않습니다 (/webhooks/를 포함해야 합니다).' }
    }
    return { ok: true, url: parsed, kind: 'discord' }
  }

  const ipPattern = /^\d{1,3}(\.\d{1,3}){3}$/
  if (ipPattern.test(hostname)) {
    return { ok: false, message: '외부 IP 주소 직접 입력은 허용되지 않습니다. 도메인을 사용하세요.' }
  }

  return { ok: true, url: parsed, kind: 'custom' }
}
