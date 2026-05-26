import { useUpdateStore } from '@/hooks/useUpdater'

let registered = false

export function registerUpdaterListeners(): void {
  if (registered || !window.electronAPI) return
  registered = true

  const api = window.electronAPI

  api.onUpdateChecking(() => {
    useUpdateStore.setState({ status: 'checking' })
  })

  api.onUpdateNotAvailable(() => {
    useUpdateStore.setState({ status: 'up-to-date' })
  })

  api.onUpdateAvailable((info) => {
    useUpdateStore.setState({ status: 'available', info, dismissed: false })
  })

  api.onUpdateProgress(({ percent }) => {
    useUpdateStore.setState({ status: 'downloading', progress: percent })
  })

  api.onUpdateDownloaded((info) => {
    useUpdateStore.setState({ status: 'downloaded', info, progress: 100, dismissed: false })
  })

  api.onUpdateError(({ message }) => {
    useUpdateStore.setState({ status: 'error', error: message })
  })
}
