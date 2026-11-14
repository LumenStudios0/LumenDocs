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

export interface PluginDownload {
  id: string
  productId: string
  productKey: string
  name: string
  version: string
  filename: string
  sha256: string
  size: number
  createdAt: string
}

export async function savePluginDownload(artifact: PluginDownload, signal: AbortSignal): Promise<void> {
  const configured = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
  const token = getDiscordSession()
  if (!configured || !token) throw new Error('Sign in with Discord to download your plugins.')
  const url = new URL(configured, window.location.origin)
  url.pathname = url.pathname.replace(/\/chat\/?$/, '').replace(/\/$/, '') + '/studio/downloads/' + encodeURIComponent(artifact.id)
  url.search = ''
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal })
  if (!response.ok) {
    const result = await response.json()
    throw new Error(result.error || `Download failed (${response.status}).`)
  }
  if (!response.headers.get('Content-Type')?.includes('application/java-archive')) throw new Error('The server did not return a plugin JAR.')
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength !== artifact.size) throw new Error('The download was incomplete. Please try again.')
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  const actual = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
  if (actual !== artifact.sha256) throw new Error('The downloaded file did not pass its integrity check. Do not install it.')
  if (signal.aborted || token !== getDiscordSession()) throw new Error('Download cancelled because the account changed.')
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/java-archive' }))
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = artifact.filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
