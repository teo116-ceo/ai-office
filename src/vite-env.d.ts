/// <reference types="vite/client" />

interface ElectronAPI {
  isElectron: true
  getApiKeys: () => Promise<{ anthropic: string; openai: string; gemini: string }>
  hasApiKeys: () => Promise<boolean>
  saveApiKeys: (keys: { anthropic: string; openai: string; gemini: string }) => Promise<void>
}

interface Window {
  electronAPI?: ElectronAPI
}
