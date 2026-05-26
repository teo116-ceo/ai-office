import { create } from 'zustand'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateInfo {
  version: string
  releaseNotes: string
  releaseDate: string
}

interface UpdateStore {
  status: UpdateStatus
  info: UpdateInfo | null
  progress: number
  error: string | null
  dismissed: boolean

  _setStatus: (status: UpdateStatus) => void
  _setInfo: (info: UpdateInfo) => void
  _setProgress: (percent: number) => void
  _setError: (error: string) => void
  dismiss: () => void
  checkForUpdates: () => Promise<void>
  installUpdate: () => Promise<void>
}

export const useUpdateStore = create<UpdateStore>((set) => ({
  status: 'idle',
  info: null,
  progress: 0,
  error: null,
  dismissed: false,

  _setStatus: (status) => set({ status }),
  _setInfo: (info) => set({ info }),
  _setProgress: (progress) => set({ progress }),
  _setError: (error) => set({ error }),
  dismiss: () => set({ dismissed: true }),

  checkForUpdates: async () => {
    if (!window.electronAPI) return
    set({ status: 'checking', dismissed: false })
    await window.electronAPI.checkForUpdates()
  },

  installUpdate: async () => {
    if (!window.electronAPI) return
    await window.electronAPI.installUpdate()
  },
}))
