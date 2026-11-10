const sessionKey = 'lumen-discord-session'

export function getDiscordSession() {
  const saved = localStorage.getItem(sessionKey)
  if (saved) return saved

  const previousSession = sessionStorage.getItem(sessionKey) ?? ''
  if (previousSession) {
    localStorage.setItem(sessionKey, previousSession)
    sessionStorage.removeItem(sessionKey)
  }
  return previousSession
}

export function storeDiscordSession(token: string) {
  localStorage.setItem(sessionKey, token)
  sessionStorage.removeItem(sessionKey)
}

export function clearDiscordSession() {
  localStorage.removeItem(sessionKey)
  sessionStorage.removeItem(sessionKey)
}
