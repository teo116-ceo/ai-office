export interface ErrorLogEntry {
  id: string
  timestamp: Date
  source: string
  model?: string
  message: string
  status?: number
}

const MAX_ENTRIES = 200

const _entries: ErrorLogEntry[] = []
const _listeners = new Set<(entries: ErrorLogEntry[]) => void>()

export function recordError(entry: Omit<ErrorLogEntry, 'id' | 'timestamp'>): void {
  const newEntry: ErrorLogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    ...entry,
  }
  _entries.unshift(newEntry)
  if (_entries.length > MAX_ENTRIES) _entries.splice(MAX_ENTRIES)
  _listeners.forEach((cb) => cb([..._entries]))
}

export function getErrorLog(): ErrorLogEntry[] {
  return [..._entries]
}

export function subscribeErrorLog(cb: (entries: ErrorLogEntry[]) => void): () => void {
  _listeners.add(cb)
  return () => _listeners.delete(cb)
}

export function clearErrorLog(): void {
  _entries.length = 0
  _listeners.forEach((cb) => cb([]))
}
