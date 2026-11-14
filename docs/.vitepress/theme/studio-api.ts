import { getDiscordSession } from './discord-session'

export async function studioRequest<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const configured = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
  if (!configured) throw new Error('Website tools are not configured.')
  const url = new URL(configured, window.location.origin)
  const [route, query] = path.split('?')
  url.pathname = url.pathname.replace(/\/chat\/?$/, '').replace(/\/$/, '') + '/studio' + route
  url.search = query || ''
  const token = authenticated ? getDiscordSession() : ''
  if (authenticated && !token) throw new Error('Sign in with Discord to continue.')
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || `Website request failed (${response.status}).`)
  return result as T
}

export interface ProductRelease {
  id: string
  productId: string
  version: string
  channel: 'stable' | 'beta'
  body: string
  minecraftVersions: string
  published: boolean
  createdAt: string
  updatedAt: string
}
