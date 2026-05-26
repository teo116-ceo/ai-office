import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type RuntimeApiKeys = {
  anthropic?: string
  openai?: string
  gemini?: string
}

const KEY_FILE = join(process.cwd(), '.api-keys.local')

function normalize(keys: RuntimeApiKeys): RuntimeApiKeys {
  return {
    anthropic: keys.anthropic?.trim() || undefined,
    openai: keys.openai?.trim() || undefined,
    gemini: keys.gemini?.trim() || undefined,
  }
}

export function applyRuntimeApiKeys(keys: RuntimeApiKeys): void {
  const normalized = normalize(keys)
  if (normalized.anthropic) process.env.ANTHROPIC_API_KEY = normalized.anthropic
  if (normalized.openai) process.env.OPENAI_API_KEY = normalized.openai
  if (normalized.gemini) process.env.GEMINI_API_KEY = normalized.gemini
}

export function loadRuntimeApiKeys(): void {
  if (!existsSync(KEY_FILE)) return

  try {
    const parsed = JSON.parse(readFileSync(KEY_FILE, 'utf-8')) as RuntimeApiKeys
    applyRuntimeApiKeys(parsed)
  } catch (error) {
    console.warn('[runtimeApiKeys] failed to load local API keys:', error)
  }
}

export function hasAnyProviderKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY)
}

export function getRuntimeApiKeyStatus() {
  return {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
  }
}

export function saveRuntimeApiKeys(keys: RuntimeApiKeys): void {
  const next = normalize({
    anthropic: keys.anthropic || process.env.ANTHROPIC_API_KEY,
    openai: keys.openai || process.env.OPENAI_API_KEY,
    gemini: keys.gemini || process.env.GEMINI_API_KEY,
  })

  applyRuntimeApiKeys(next)
  writeFileSync(KEY_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf-8')
}

export function clearRuntimeApiKeys(): void {
  process.env.ANTHROPIC_API_KEY = ''
  process.env.OPENAI_API_KEY = ''
  process.env.GEMINI_API_KEY = ''
  writeFileSync(KEY_FILE, '{}\n', 'utf-8')
}
