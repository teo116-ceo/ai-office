import { contextBridge, ipcRenderer } from 'electron'

// 새 버전 여부를 동기적으로 읽음 (페이지 로드 전, Zustand hydrate 전에 확인)
// 'install' = 신규/재설치, 'update' = 버전 업데이트, null = 동일 버전 재실행
const freshVersionFlag = ipcRenderer.sendSync('get-fresh-version-sync') as 'install' | 'update' | null
const isFreshVersion = freshVersionFlag !== null      // 신규 설치 또는 업데이트
const isFreshInstall = freshVersionFlag === 'install' // 신규/재설치만

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true as const,
  isFreshVersion,
  isFreshInstall,
  getApiKeys: (): Promise<{ anthropic: string; openai: string; gemini: string }> =>
    ipcRenderer.invoke('get-api-keys'),
  hasApiKeys: (): Promise<boolean> =>
    ipcRenderer.invoke('has-api-keys'),
  saveApiKeys: (keys: { anthropic: string; openai: string; gemini: string }): Promise<void> =>
    ipcRenderer.invoke('save-api-keys', keys),
  hasConfirmedSetup: (): Promise<boolean> =>
    ipcRenderer.invoke('has-confirmed-setup'),
  saveSessionForRelaunch: (token: string): Promise<void> =>
    ipcRenderer.invoke('save-session-for-relaunch', token),
  getSessionForRelaunch: (): Promise<string | null> =>
    ipcRenderer.invoke('get-session-for-relaunch'),
  // ─── 시스템 설정 ──────────────────────────────────────────────────────────
  getLoginItem: (): Promise<boolean> =>
    ipcRenderer.invoke('get-login-item'),
  setLoginItem: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('set-login-item', enabled),
  showNotification: (title: string, body: string): Promise<void> =>
    ipcRenderer.invoke('show-notification', title, body),
  toggleWindow: (): Promise<void> =>
    ipcRenderer.invoke('toggle-window'),
  // ─── 자동 업데이트 ────────────────────────────────────────────────────────
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('update:get-version'),
  checkForUpdates: (): Promise<void> =>
    ipcRenderer.invoke('update:check'),
  installUpdate: (): Promise<void> =>
    ipcRenderer.invoke('update:install'),
  onUpdateChecking: (cb: () => void) => {
    ipcRenderer.removeAllListeners('update:checking')
    ipcRenderer.on('update:checking', () => cb())
  },
  onUpdateAvailable: (cb: (info: { version: string; releaseNotes: string; releaseDate: string }) => void) => {
    ipcRenderer.removeAllListeners('update:available')
    ipcRenderer.on('update:available', (_, data) => cb(data as { version: string; releaseNotes: string; releaseDate: string }))
  },
  onUpdateNotAvailable: (cb: () => void) => {
    ipcRenderer.removeAllListeners('update:not-available')
    ipcRenderer.on('update:not-available', () => cb())
  },
  onUpdateProgress: (cb: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => {
    ipcRenderer.removeAllListeners('update:progress')
    ipcRenderer.on('update:progress', (_, data) => cb(data as { percent: number; bytesPerSecond: number; transferred: number; total: number }))
  },
  onUpdateDownloaded: (cb: (info: { version: string; releaseNotes: string; releaseDate: string }) => void) => {
    ipcRenderer.removeAllListeners('update:downloaded')
    ipcRenderer.on('update:downloaded', (_, data) => cb(data as { version: string; releaseNotes: string; releaseDate: string }))
  },
  onUpdateError: (cb: (error: { message: string }) => void) => {
    ipcRenderer.removeAllListeners('update:error')
    ipcRenderer.on('update:error', (_, data) => cb(data as { message: string }))
  },
})
