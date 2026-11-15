import { getDiscordSession } from './discord-session'

export function studioUrl(path: string) {
  const configured = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
  if (!configured) throw new Error('Website tools are not configured.')
  const url = new URL(configured, window.location.origin)
  const [route, query] = path.split('?')
  url.pathname = url.pathname.replace(/\/chat\/?$/, '').replace(/\/$/, '') + '/studio' + route
  url.search = query || ''
  return url.href
}

export async function studioRequest<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const url = studioUrl(path)
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

let lastUploadWrite = 0

async function pacedUploadRequest<T>(path: string, init: RequestInit): Promise<T> {
  const session = getDiscordSession()
  const delay = Math.max(0, lastUploadWrite + 2100 - Date.now())
  lastUploadWrite = Date.now() + delay
  if (delay) await new Promise<void>((resolve, reject) => {
    const signal = init.signal
    if (signal?.aborted) { reject(new Error('Upload cancelled.')); return }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancelled); resolve() }, delay)
    function cancelled() { clearTimeout(timer); reject(new Error('Upload cancelled.')) }
    signal?.addEventListener('abort', cancelled, { once: true })
  })
  if (session !== getDiscordSession()) throw new Error('Upload cancelled because the account changed.')
  return studioRequest<T>(path, init)
}

export async function cancelPluginUpload(id: string): Promise<void> {
  await pacedUploadRequest('/downloads/uploads/' + encodeURIComponent(id) + '/cancel', { method: 'POST' })
}

export async function uploadPluginDownload(
  metadata: { productId: string; version: string },
  file: File,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<PluginDownload> {
  const token = getDiscordSession()
  const current = () => {
    if (signal.aborted || !token || token !== getDiscordSession()) throw new Error('Upload cancelled because the account changed or you cancelled it.')
  }
  current()
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.jar$/i.test(file.name) || !file.size || file.size > 32 * 1048576) {
    throw new Error('Choose a .jar file with a safe filename, no larger than 32 MiB.')
  }
  progress('Fingerprinting JAR…')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('')
  current()
  const upload = await pacedUploadRequest<{ uploadId: string; chunkSize: number; batchSize: number }>('/downloads/uploads', {
    method: 'POST', signal, body: JSON.stringify({ ...metadata, filename: file.name, size: file.size, sha256 }),
  })
  const path = '/downloads/uploads/' + encodeURIComponent(upload.uploadId)
  let publishing = false
  try {
    const count = Math.ceil(bytes.length / upload.chunkSize)
    for (let start = 0; start < count; start += upload.batchSize) {
      current()
      const chunks: string[] = []
      for (let n = start; n < Math.min(count, start + upload.batchSize); n++) {
        const part = bytes.subarray(n * upload.chunkSize, (n + 1) * upload.chunkSize)
        let binary = ''
        for (let offset = 0; offset < part.length; offset += 8192) {
          binary += String.fromCharCode(...part.subarray(offset, offset + 8192))
        }
        chunks.push(btoa(binary))
      }
      await pacedUploadRequest(path + '/chunks', { method: 'PUT', signal, body: JSON.stringify({ start, chunks }) })
      progress(`Uploading JAR… ${Math.round(Math.min(count, start + chunks.length) / count * 100)}%`)
    }
    current()
    progress('Server is verifying the private stored JAR before publication…')
    publishing = true
    const result = await pacedUploadRequest<{ download: PluginDownload }>(path + '/publish', { method: 'POST', signal })
    current()
    return result.download
  } catch (error) {
    let cleanup = ''
    if (token === getDiscordSession()) {
      // Cancellation cannot delete a verifying or published artifact.
      try { await cancelPluginUpload(upload.uploadId) } catch (value) {
        cleanup = ` Draft cancellation could not be confirmed: ${value instanceof Error ? value.message : 'Cancellation failed.'} Refresh builds and discard the unfinished upload if available; private drafts expire after 24 hours.`
      }
    }
    const detail = error instanceof Error ? error.message : 'Upload failed.'
    if (publishing) throw new Error(`${detail} Refresh builds to check the outcome before uploading again. Existing downloads are unchanged.${cleanup}`)
    throw new Error(detail + cleanup)
  }
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
