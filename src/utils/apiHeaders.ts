import { getSessionToken } from '../services/sessionService'

export function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getSessionToken()
  return {
    ...(token ? { 'x-session-token': token } : {}),
    ...extra,
  }
}
