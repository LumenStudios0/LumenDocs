export class CommunityUnavailableError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'CommunityUnavailableError'
    this.status = status
  }
}

export function communityAvailabilityError(path, status, payload) {
  const message = typeof payload?.error === 'string' ? payload.error : ''
  const missingTicket = /^\/tickets\/[0-9a-f-]{36}(?:\/replies)?$/i.test(path.split('?')[0]) && message === 'Ticket not found'
  const missingForumItem = /^\/(?:staff\/)?forum\//i.test(path.split('?')[0]) && /^(Thread|Post) not found$/.test(message)
  if ((status === 404 && !missingTicket && !missingForumItem) || payload?.code === 'COMMUNITY_SERVICE_UNAVAILABLE' || status === 0) {
    return new CommunityUnavailableError(
      'This feature is not connected yet. Website tickets, updates, and live service status require the updated Worker and its database.',
      status,
    )
  }
  if (status >= 500) {
    return new CommunityUnavailableError('Website support is temporarily unavailable. Please check back later.', status)
  }
  return null
}
