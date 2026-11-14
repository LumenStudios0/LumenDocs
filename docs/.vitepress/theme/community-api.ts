import { getDiscordSession } from './discord-session'
import { visibleServiceError } from './service-errors'
import { communityAvailabilityError } from './community-errors.mjs'

export interface Ticket {
  id: string
  type: string
  title: string
  body: string
  productId?: string | null
  status: 'open' | 'waiting' | 'closed'
  customerName: string
  assignedTo: { id: string; name: string } | null
  labels: string[]
  serverSoftware?: string | null
  minecraftVersion?: string | null
  alertDelivery?: string
  alertConfigured?: boolean
  alert?: { state: string; attempts: number; lastError: string | null } | null
  customerDiscordId?: string
  createdAt: string
  updatedAt: string
}
export interface StaffMember { id: string; name: string }
export interface Reply { id: string; body: string; authorName: string; staff: boolean; createdAt: string }
export interface Issue {
  id: string
  title: string
  body: string
  productId?: string | null
  status: 'open' | 'investigating' | 'resolved'
  published?: boolean
  createdAt: string
  updatedAt: string
}
export type ForumChannel = 'announcements' | 'general' | 'help' | 'bugs' | 'suggestions' | 'showcase'
export interface ForumThread {
  id: string
  channel: ForumChannel
  title: string
  body: string
  productId?: string | null
  status: 'open' | 'answered' | 'resolved'
  pinned: boolean
  locked: boolean
  hidden?: boolean
  replyCount: number
  author: { name: string; staff: boolean }
  mine: boolean
  createdAt: string
  lastActivityAt: string
}
export interface ForumPost { id: string; body: string; authorName: string; staff: boolean; hidden?: boolean; createdAt: string }
export interface ForumViewer { signedIn: boolean; staff: boolean }
export interface Notification {
  id: string
  title: string
  body: string
  kind: 'update' | 'announcement' | 'ticket'
  productId?: string | null
  audience?: string
  createdAt: string
  read: boolean
  link: string
}
export interface Preferences { updates: boolean; announcements: boolean; ticketReplies: boolean; products: string[] }
export type ServiceStatus = 'operational' | 'degraded' | 'outage' | 'maintenance' | 'unknown'
export interface Service {
  id: string
  name: string
  status: ServiceStatus
  automaticStatus: ServiceStatus
  overrideStatus: ServiceStatus | null
  message: string
  checkedAt: string | null
}
export interface CommunityPage<T> { items: T[]; total: number; page: number; pageSize: number }

export async function communityRequest<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const configured = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
  if (!configured) throw communityAvailabilityError(path, 0, null)
  const url = new URL(configured, window.location.origin)
  url.pathname = url.pathname.replace(/\/chat\/?$/, '').replace(/\/$/, '') + '/community' + path.split('?')[0]
  url.search = path.includes('?') ? path.slice(path.indexOf('?') + 1) : ''
  const token = authenticated ? getDiscordSession() : ''
  if (authenticated && !token) throw new Error('Connect your Discord account using Log in to use this feature.')
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    })
  } catch (error) {
    console.error('Website service request failed:', error)
    throw communityAvailabilityError(path, 503, null)
  }
  let result: T & { error?: string; code?: string }
  try { result = await response.json() }
  catch (error) {
    console.error('Website service returned an invalid response:', error)
    const unavailable = communityAvailabilityError(path, response.status, null)
    if (unavailable) throw unavailable
    throw new Error(await visibleServiceError(`The website service returned an invalid response (${response.status}).`, 0, 'website'))
  }
  if (!response.ok) {
    const unavailable = communityAvailabilityError(path, response.status, result)
    if (unavailable) throw unavailable
    throw new Error(await visibleServiceError(result?.error || `Website request failed (${response.status}).`, response.status, 'website'))
  }
  return result
}

export function communityDate(value: string | null) {
  if (!value) return 'Not checked yet'
  return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Date unavailable'
}
