import { hasPermission, resolveAccess } from './access-control.js'
import { staffGuides } from './staff-knowledge.js'
import { staffOperationalSummary } from './staff-operations.js'

const stopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'what', 'how', 'can', 'you', 'please', 'help', 'staff', 'mode', 'need', 'would', 'should', 'have', 'does', 'from', 'some', 'about', 'into'])
const tokens = text => text.toLowerCase().match(/[a-z0-9][a-z0-9_.-]{2,}/g)?.filter(term => !stopWords.has(term)) || []
const matches = (text, term) => tokens(text).filter(word => word === term).length
const shortReply = text => {
  const words = text.trim().split(/\s+/)
  return words.length > 100 ? `${words.slice(0, 100).join(' ')}...` : text.trim()
}

export function rankStaffGuides(question, guides = staffGuides) {
  const terms = [...new Set(tokens(question))]
  return guides.map(guide => {
    const title = guide.title.toLowerCase()
    const body = guide.body.toLowerCase()
    const score = terms.reduce((sum, term) => sum + (matches(title, term) ? 8 : 0)
      + Math.min(matches(body, term), 3), 0)
      + (guide.id === 'integration' && /\b(java|code|validate|validation|token|integrate)\b/i.test(question) ? 12 : 0)
    return { guide, score }
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 4)
}

function guideSections(guide, question, detailed) {
  const terms = tokens(question)
  const sections = guide.body.split(/(?=^### )/m).filter(Boolean)
  const ranked = sections.map((text, index) => ({ text, index,
    score: terms.reduce((sum, term) => sum + Math.min(matches(text, term), 4), 0) }))
    .sort((a, b) => b.score - a.score)
  if (detailed) return ranked.slice(0, 3).sort((a, b) => a.index - b.index).map(item => item.text.trim()).join('\n\n')
  const paragraphs = ranked[0]?.text.replace(/^### .*\n/, '').split(/\n\s*\n/) || []
  return shortReply(paragraphs.find(text => text.trim() && !text.includes('```')) || guide.summary)
}

export async function staffAssistant(request, env, origin, deps) {
  const send = (payload, status = 200) => deps.respond(payload, status, origin)
  if (request.method !== 'POST') return send({ error: 'Staff assistant accepts questions with POST.' }, 405)
  const authorization = request.headers.get('Authorization') || ''
  const user = await deps.verifyLoginToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '', env)
  if (!user) return send({ error: 'Sign in with your staff Discord account.' }, 401)
  if (!env.COMMUNITY_DB) return send({ error: 'Staff assistant cannot verify access without the staff database.' }, 503)
  const access = await resolveAccess(user.id, env)
  if (access.rank < 2 || !hasPermission(access, 'staff.docs')) return send({ error: 'Staff assistant requires Jr Support rank or higher and staff.docs permission.' }, 403)
  if (!env.ADMIN_READ_LIMITER) return send({ error: 'Staff assistant request limiting is unavailable.' }, 503)
  if (!(await env.ADMIN_READ_LIMITER.limit({ key: `staff-assistant:${user.id}` })).success) return send({ error: 'Please wait before asking another staff question.' }, 429)
  const raw = await request.text()
  if (raw.length > 16000) return send({ error: 'Staff question is too large.' }, 413)
  let payload
  try { payload = JSON.parse(raw) } catch { return send({ error: 'Expected a JSON staff question.' }, 400) }
  const question = typeof payload?.question === 'string' ? payload.question.trim() : ''
  if (!question || question.length > 4000) return send({ error: 'Staff questions must be between 1 and 4000 characters.' }, 400)

  if (/^(?:(?:hey|hi|hello|hiya|yo)(?: there| staff| assistant)?|(?:thanks|thank you)(?: so much)?)[!.,?\s]*$/i.test(question)) {
    return send({ mode: 'staff', provider: 'server-local-knowledge',
      answer: /^(thanks|thank you)/i.test(question) ? "You're welcome!" : 'Hey! What can I help you with?',
      sources: [], links: [] })
  }
  const detailed = /\b(full|complete|detailed|in.depth|step.by.step)\b/i.test(question)
  const codeRequested = /\b(code|implementation)\b/i.test(question)
    && /\b(show|give|write|send|need|full|complete|exact|copy.ready)\b/i.test(question)
  const ranked = rankStaffGuides(question)
  const sources = ranked.slice(0, detailed || codeRequested ? 4 : 1).map(({ guide }) => ({
    id: guide.id, title: guide.title, category: guide.category,
    href: `/staff/?guide=${encodeURIComponent(guide.id)}&category=${encodeURIComponent(guide.category)}`,
  }))
  const links = [
    { title: 'Availability', href: '/staff/?view=availability', permission: 'staff.presence' },
    { title: 'Task board', href: '/staff/?view=tasks', permission: 'staff.tasks' },
    { title: 'Commission pipeline', href: '/staff/?view=commissions', permission: 'staff.commissions' },
    { title: 'Warnings', href: '/staff/?view=warnings', permission: 'staff.warnings' },
    { title: 'Ticket queue', href: '/admin/#tickets', permission: 'tickets.view' },
    { title: 'Onboarding', href: '/staff/?view=onboarding', permission: 'staff.docs' },
    { title: 'Practice scenarios', href: '/staff/?view=practice', permission: 'staff.docs' },
  ].filter(link => hasPermission(access, link.permission) && (link.href.startsWith('/admin/') ? hasPermission(access, 'dashboard.view') : true))
    .filter(link => detailed || codeRequested || tokens(link.title).some(term => tokens(question).includes(term)))
    .slice(0, detailed || codeRequested ? 7 : 2)
    .map(({ title, href }) => ({ title, href }))
  let answer
  if (codeRequested && ranked[0]?.guide.id === 'integration') {
    answer = `Here is the verified integration reference, including configuration, dependencies, the Java helper, and lifecycle wiring. Replace package names and registry placeholders before building; never put administrator credentials in the plugin.\n\n${ranked[0].guide.body}`
  } else if (ranked.length) {
    answer = ranked.slice(0, detailed ? 2 : 1).map(({ guide }) => guideSections(guide, question, detailed)).join('\n\n')
  } else {
    answer = 'I cannot establish an answer from the staff guides. Which plugin or task do you need help with?'
  }
  let summary
  if (/\b(availability|available|online|team|tasks?|board|commissions?|tickets?|backlog)\b/i.test(question)) {
    summary = await staffOperationalSummary(env, access)
    const lines = []
    for (const [key, title] of [['tasks', 'Tasks'], ['commissions', 'Commission pipeline'], ['tickets', 'Tickets']]) {
      if (Array.isArray(summary[key]) && summary[key].length) {
        lines.push(`${title}: ${summary[key].map(row => `${row.type ? row.type + ' / ' : ''}${row.stage || row.status}: ${row.count}`).join('; ')}.`)
      } else if (hasPermission(access, key === 'tasks' ? 'staff.tasks' : key === 'commissions' ? 'staff.commissions' : 'tickets.view')) {
        lines.push(`${title}: no recorded items.`)
      }
    }
    if (hasPermission(access, 'staff.presence') && summary.members) {
      lines.push(`Team: ${summary.members.total} staff; ${summary.members.online} online; ${summary.members.offline} offline. Reported availability: ${summary.presence.map(row => `${row.availability}: ${row.count}`).join('; ')}.`)
    }
    answer = `${lines.join('\n') || 'Your permissions do not allow these operational summaries.'}\n\nCounts are a current snapshot, not guarantees.${detailed ? `\n\n${answer}` : ''}`
  }
  if (!detailed && !(codeRequested && ranked[0]?.guide.id === 'integration')) answer = shortReply(answer)
  return send({ mode: 'staff', provider: 'server-local-knowledge', answer, sources, links,
    ...(summary ? { summary } : {}),
    privacy: 'Private guide retrieval runs on the studio Worker. No question, guide, or staff record is sent to the public AI provider.' })
}
