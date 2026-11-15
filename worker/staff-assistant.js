import { hasPermission, resolveAccess } from './access-control.js'
import { staffGuides } from './staff-knowledge.js'
import { staffOperationalSummary } from './staff-operations.js'

const stopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'what', 'how', 'can', 'you', 'please', 'help', 'staff', 'mode', 'need', 'would', 'should', 'have', 'does', 'from', 'some', 'about', 'into'])
const tokens = text => text.toLowerCase().match(/[a-z0-9][a-z0-9_.-]{2,}/g)?.filter(term => !stopWords.has(term)) || []

export function rankStaffGuides(question, guides = staffGuides) {
  const terms = [...new Set(tokens(question))]
  return guides.map(guide => {
    const title = guide.title.toLowerCase()
    const body = guide.body.toLowerCase()
    const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 8 : 0)
      + Math.min(body.split(term).length - 1, 3), 0)
      + (guide.id === 'integration' && /\b(java|code|validate|validation|token|integrate)\b/i.test(question) ? 12 : 0)
    return { guide, score }
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 4)
}

function guideSections(guide, question) {
  const terms = tokens(question)
  const sections = guide.body.split(/(?=^### )/m).filter(Boolean)
  const ranked = sections.map((text, index) => ({ text, index,
    score: terms.reduce((sum, term) => sum + Math.min(text.toLowerCase().split(term).length - 1, 4), 0) }))
    .sort((a, b) => b.score - a.score)
  return ranked.slice(0, 3).sort((a, b) => a.index - b.index).map(item => item.text.trim()).join('\n\n')
}

export async function staffAssistant(request, env, origin, deps) {
  const send = (payload, status = 200) => deps.respond(payload, status, origin)
  if (request.method !== 'POST') return send({ error: 'Staff assistant accepts questions with POST.' }, 405)
  const authorization = request.headers.get('Authorization') || ''
  const user = await deps.verifyLoginToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '', env)
  if (!user) return send({ error: 'Sign in with your staff Discord account.' }, 401)
  if (!env.COMMUNITY_DB) return send({ error: 'Staff assistant cannot verify access without the staff database.' }, 503)
  const access = await resolveAccess(user.id, env)
  if (access.rank < 2 || !hasPermission(access, 'staff.docs')) return send({ error: 'Staff assistant requires Support team rank or higher and staff.docs permission.' }, 403)
  if (!env.ADMIN_READ_LIMITER) return send({ error: 'Staff assistant request limiting is unavailable.' }, 503)
  if (!(await env.ADMIN_READ_LIMITER.limit({ key: `staff-assistant:${user.id}` })).success) return send({ error: 'Please wait before asking another staff question.' }, 429)
  const raw = await request.text()
  if (raw.length > 16000) return send({ error: 'Staff question is too large.' }, 413)
  let payload
  try { payload = JSON.parse(raw) } catch { return send({ error: 'Expected a JSON staff question.' }, 400) }
  const question = typeof payload?.question === 'string' ? payload.question.trim() : ''
  if (!question || question.length > 4000) return send({ error: 'Staff questions must be between 1 and 4000 characters.' }, 400)

  const ranked = rankStaffGuides(question)
  const sources = ranked.map(({ guide }) => ({
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
    .map(({ title, href }) => ({ title, href }))
  let answer
  if (/\b(code|java|implementation|copy.ready)\b/i.test(question) && ranked[0]?.guide.id === 'integration') {
    answer = `Here is the verified integration reference, including configuration, dependencies, the Java helper, and lifecycle wiring. Replace package names and registry placeholders before building; never put administrator credentials in the plugin.\n\n${ranked[0].guide.body}`
  } else if (ranked.length) {
    answer = `Let's work from verified studio guidance. I found ${ranked.length} relevant playbook${ranked.length === 1 ? '' : 's'}. Check your exact plugin release before applying changes.\n\n`
      + ranked.slice(0, 2).map(({ guide }) => `## ${guide.title}\n\n${guideSections(guide, question)}`).join('\n\n')
      + '\n\nNext step: record the checks and their results in the private ticket. I have not changed any live records.'
  } else {
    answer = 'I cannot establish an answer from the current staff playbooks. Include the plugin name, exact error code, and the workflow you are investigating. For availability, tasks, commissions, or training, use the authorized tools below. I do not guess live status or claim to perform actions.'
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
    answer = `## Live operations snapshot\n${lines.join('\n') || 'Your permissions do not allow these operational summaries.'}\n\nThis snapshot reports current database counts, not completion guarantees. Open the authorized tool below for details.\n\n${answer}`
  }
  return send({ mode: 'staff', provider: 'server-local-knowledge', answer, sources, links,
    ...(summary ? { summary } : {}),
    privacy: 'Private guide retrieval runs on the studio Worker. No question, guide, or staff record is sent to the public AI provider.' })
}
