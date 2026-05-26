/// <reference types="vite/client" />

interface ElectronAPI {
  isElectron: true
  isFreshVersion: boolean
  isFreshInstall: boolean
  getApiKeys: () => Promise<{ anthropic: string; openai: string; gemini: string }>
  hasApiKeys: () => Promise<boolean>
  saveApiKeys: (keys: { anthropic: string; openai: string; gemini: string }) => Promise<void>
  hasConfirmedSetup: () => Promise<boolean>
  saveSessionForRelaunch: (token: string) => Promise<void>
  getSessionForRelaunch: () => Promise<string | null>
  // 시스템 설정
  getLoginItem: () => Promise<boolean>
  setLoginItem: (enabled: boolean) => Promise<void>
  showNotification: (title: string, body: string) => Promise<void>
  toggleWindow: () => Promise<void>
  // 자동 업데이트
  getAppVersion: () => Promise<string>
  checkForUpdates: () => Promise<void>
  installUpdate: () => Promise<void>
  onUpdateChecking: (cb: () => void) => void
  onUpdateAvailable: (cb: (info: { version: string; releaseNotes: string; releaseDate: string }) => void) => void
  onUpdateNotAvailable: (cb: () => void) => void
  onUpdateProgress: (cb: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => void
  onUpdateDownloaded: (cb: (info: { version: string; releaseNotes: string; releaseDate: string }) => void) => void
  onUpdateError: (cb: (error: { message: string }) => void) => void
}

interface Window {
  electronAPI?: ElectronAPI
}
