import { getDiscordSession } from './discord-session'

export const licenseServiceNotice = 'The license system is temporarily unavailable or being worked on. Please try again later.'
const websiteServiceNotice = 'Website support is temporarily unavailable. Please try again later.'
let verifiedToken = ''
let staffCheck: Promise<boolean> | undefined

async function isVerifiedStaff() {
  const token = getDiscordSession()
  if (!token) return false
  if (token !== verifiedToken || !staffCheck) {
    verifiedToken = token
    staffCheck = (async () => {
      const configured = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
      if (!configured) return false
      const url = new URL(configured, window.location.origin)
      url.pathname = url.pathname.replace(/\/chat\/?$/, '').replace(/\/$/, '') + '/auth/me'
      url.search = ''
      try {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        const result = await response.json() as { user?: { permissions?: string[] } }
        return response.ok && Boolean(result.user?.permissions?.includes('dashboard.view'))
      } catch {
        return false
      }
    })()
  }
  return staffCheck
}

export async function visibleServiceError(message: string, status: number, service: 'licensing' | 'website') {
  const technical = status === 0 || status >= 500 ||
    /not configured|LICENSE_API_|COMMUNITY_DB|invalid response/i.test(message) ||
    (service === 'website' && status === 404 && message !== 'Ticket not found')
  if (!technical) return message
  if (await isVerifiedStaff()) return message
  return service === 'licensing' ? licenseServiceNotice : websiteServiceNotice
}
