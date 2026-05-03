import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true as const,
  getApiKeys: (): Promise<{ anthropic: string; openai: string; gemini: string }> =>
    ipcRenderer.invoke('get-api-keys'),
  hasApiKeys: (): Promise<boolean> =>
    ipcRenderer.invoke('has-api-keys'),
  saveApiKeys: (keys: { anthropic: string; openai: string; gemini: string }): Promise<void> =>
    ipcRenderer.invoke('save-api-keys', keys),
})
