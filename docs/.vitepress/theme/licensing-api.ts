import { getDiscordSession } from './discord-session'

export class LicenseApiError extends Error {
  constructor(message: string, public status = 0) {
    super(message)
  }
}

const pendingReads = new Map<string, Promise<unknown>>()

export async function accountRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getDiscordSession()
  if (!token) throw new LicenseApiError('Sign in with Discord to view your license account.', 401)
  const configured = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
  if (!configured) throw new LicenseApiError('The customer licensing endpoint is not configured.')
  const url = new URL(configured, window.location.origin)
  url.pathname = url.pathname.replace(/\/chat\/?$/, '').replace(/\/$/, '') + path
  url.search = ''
  const readKey = `${token}:${url}`
  if (!init.method || init.method === 'GET') {
    const pending = pendingReads.get(readKey)
    if (pending) return pending as Promise<T>
  }
  const request = (async () => {
    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      })
    } catch (error) {
      console.error('Unable to reach the licensing API:', error)
      throw new LicenseApiError('Could not reach the licensing service. Check your connection and try again.')
    }
    let result: T & { error?: string; detail?: string }
    try { result = await response.json() }
    catch (error) {
      console.error('Invalid licensing API response:', error)
      throw new LicenseApiError(`The licensing service returned an invalid response (${response.status}).`, response.status)
    }
    if (!response.ok) {
      throw new LicenseApiError(
        typeof result?.detail === 'string' ? result.detail : result?.error ?? `License request failed (${response.status}).`,
        response.status,
      )
    }
    return result
  })()
  const isRead = !init.method || init.method === 'GET'
  if (isRead) pendingReads.set(readKey, request)
  try {
    return await request
  } finally {
    if (isRead) pendingReads.delete(readKey)
  }
}
