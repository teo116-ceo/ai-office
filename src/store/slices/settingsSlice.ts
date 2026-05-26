import type { StateCreator } from 'zustand'
import type { AgentStore } from '../agentStore.types'
import type { ProviderId, ProviderUsageStats } from '@/types'
import type { AccessControlSettings } from '../agentStore.types'
import { validateWebhookUrl } from '@/utils/webhookValidation'
import { getNextThemeMode, isThemeMode } from '@/utils/themePresets'

const emptyUsage = (provider: ProviderId): ProviderUsageStats => ({
  provider,
  requestCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  updatedAt: null,
})

export { emptyUsage }

export type SettingsSlice = Pick<
  AgentStore,
  | 'webhookSettings' | 'schedulerSettings' | 'notionSettings'
  | 'usageByProvider' | 'dailyTokenBudget'
  | 'themeMode' | 'fontFamily' | 'fontSize' | 'responseLanguage'
  | 'accessControl'
  | 'setWebhookSettings' | 'resetWebhookSettings'
  | 'setSchedulerSettings'
  | 'setNotionSettings' | 'resetNotionSettings'
  | 'recordProviderUsage' | 'resetProviderUsage'
  | 'setDailyTokenBudget' | 'checkAndConsumeTokenBudget'
  | 'setThemeMode' | 'toggleTheme' | 'setFontFamily' | 'setFontSize' | 'setResponseLanguage'
  | 'setAccessControl'
>

const safeLocalStorage = {
  getItem: (key: string): string | null =>
    typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null,
  setItem: (key: string, value: string): void => {
    if (typeof localStorage !== 'undefined') safeLocalStorage.setItem(key, value)
  },
}

export const createSettingsSlice: StateCreator<AgentStore, [], [], SettingsSlice> = (set, get) => ({
  webhookSettings: {
    url: '',
    enabled: false,
    onTaskComplete: true,
    onTaskFail: true,
    onDailyBriefing: true,
    departmentWebhooks: {},
  },
  schedulerSettings: {
    enabled: false,
    hourUTC: 9,
    minute: 0,
  },
  notionSettings: {
    enabled: false,
    token: '',
    databaseId: '',
    departmentDatabases: {},
    onTaskComplete: true,
    onTaskFail: false,
  },
  usageByProvider: {
    anthropic: emptyUsage('anthropic'),
    openai: emptyUsage('openai'),
    gemini: emptyUsage('gemini'),
  },
  dailyTokenBudget: {
    enabled: false,
    limitTokens: 100_000,
    usedToday: 0,
    resetDate: new Date().toISOString().slice(0, 10),
  },
  themeMode: (() => {
    const saved = safeLocalStorage.getItem('ai-office-theme')
    return isThemeMode(saved) ? saved : 'dark'
  })(),
  fontFamily: (safeLocalStorage.getItem('ai-office-font') as AgentStore['fontFamily']) ?? 'system',
  fontSize: (safeLocalStorage.getItem('ai-office-font-size') as AgentStore['fontSize']) ?? 'medium',
  responseLanguage: (safeLocalStorage.getItem('ai-office-response-lang') as AgentStore['responseLanguage']) ?? 'auto',
  accessControl: {
    enabled: false,
    allowedDepartments: null,
  } satisfies AccessControlSettings,

  setWebhookSettings: (settings) =>
    set((state) => ({ webhookSettings: { ...state.webhookSettings, ...settings } })),
  resetWebhookSettings: () =>
    set({ webhookSettings: { url: '', enabled: false, onTaskComplete: true, onTaskFail: true, onDailyBriefing: true, departmentWebhooks: {} } }),

  setSchedulerSettings: (settings) =>
    set((state) => ({ schedulerSettings: { ...state.schedulerSettings, ...settings } })),

  setNotionSettings: (settings) =>
    set((state) => ({ notionSettings: { ...state.notionSettings, ...settings } })),
  resetNotionSettings: () =>
    set({ notionSettings: { enabled: false, token: '', databaseId: '', departmentDatabases: {}, onTaskComplete: true, onTaskFail: false } }),

  recordProviderUsage: (provider, usage) =>
    set((state) => ({
      usageByProvider: {
        ...state.usageByProvider,
        [provider]: {
          ...state.usageByProvider[provider],
          requestCount: state.usageByProvider[provider].requestCount + 1,
          inputTokens: state.usageByProvider[provider].inputTokens + usage.inputTokens,
          outputTokens: state.usageByProvider[provider].outputTokens + usage.outputTokens,
          totalTokens: state.usageByProvider[provider].totalTokens + usage.totalTokens,
          lastModel: usage.model ?? state.usageByProvider[provider].lastModel,
          updatedAt: new Date(),
        },
      },
    })),

  resetProviderUsage: (provider) =>
    set((state) => ({
      usageByProvider: provider
        ? { ...state.usageByProvider, [provider]: emptyUsage(provider) }
        : { anthropic: emptyUsage('anthropic'), openai: emptyUsage('openai'), gemini: emptyUsage('gemini') },
    })),

  setDailyTokenBudget: (settings) =>
    set((state) => ({ dailyTokenBudget: { ...state.dailyTokenBudget, ...settings } })),

  checkAndConsumeTokenBudget: (tokens) => {
    const budget = get().dailyTokenBudget
    if (!budget.enabled || budget.limitTokens === 0) return true
    const today = new Date().toISOString().slice(0, 10)
    if (budget.resetDate !== today) {
      set({ dailyTokenBudget: { ...budget, usedToday: tokens, resetDate: today } })
      return true
    }
    if (budget.usedToday + tokens > budget.limitTokens) return false
    set({ dailyTokenBudget: { ...budget, usedToday: budget.usedToday + tokens } })
    return true
  },

  setThemeMode: (mode) => {
    safeLocalStorage.setItem('ai-office-theme', mode)
    set({ themeMode: mode })
  },
  toggleTheme: () =>
    set((state) => {
      const next = getNextThemeMode(state.themeMode)
      safeLocalStorage.setItem('ai-office-theme', next)
      return { themeMode: next }
    }),
  setFontFamily: (font) => {
    safeLocalStorage.setItem('ai-office-font', font)
    set({ fontFamily: font })
  },
  setFontSize: (size) => {
    safeLocalStorage.setItem('ai-office-font-size', size)
    set({ fontSize: size })
  },
  setResponseLanguage: (lang) => {
    safeLocalStorage.setItem('ai-office-response-lang', lang)
    set({ responseLanguage: lang })
  },

  setAccessControl: (settings) =>
    set((state) => ({ accessControl: { ...state.accessControl, ...settings } })),
})

export function reviveWebhookSettings(
  webhookSettings: Partial<AgentStore['webhookSettings']> | undefined,
  fallback: AgentStore['webhookSettings'],
): AgentStore['webhookSettings'] {
  const next = { ...fallback, ...webhookSettings }
  return { ...next, enabled: next.enabled && validateWebhookUrl(next.url).ok }
}
