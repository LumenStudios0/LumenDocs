const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

function respond(data, status, origin) {
  const headers = new Headers(jsonHeaders)
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Vary', 'Origin')
  return new Response(JSON.stringify(data), { status, headers })
}

function cleanReportValue(value, maxLength) {
  return value
    .trim()
    .slice(0, maxLength)
    .replace(/@/g, '@\u200b')
    .replace(/([\\`*_~|])/g, '\\$1')
}

async function submitReport(request, env, origin) {
  if (!env.DISCORD_BUG_REPORT_WEBHOOK) {
    return respond({ error: 'Reports are not configured yet' }, 503, origin)
  }

  const ip = request.headers.get('CF-Connecting-IP')
  if (!ip) return respond({ error: 'Request could not be verified' }, 400, origin)

  const rateLimit = await env.ASSISTANT_LIMITER.limit({ key: `reports:${ip}` })
  if (!rateLimit.success) {
    return respond({ error: 'Please wait a moment before submitting another report' }, 429, origin)
  }

  const body = await request.text()
  if (body.length > 8000) return respond({ error: 'Report is too large' }, 413, origin)

  let payload
  try {
    payload = JSON.parse(body)
  } catch {
    return respond({ error: 'Expected a JSON request' }, 400, origin)
  }

  const fields = {
    type: typeof payload?.type === 'string' ? payload.type.trim() : 'bug',
    plugin: typeof payload?.plugin === 'string' ? payload.plugin.trim() : '',
    serverSoftware: typeof payload?.serverSoftware === 'string' ? payload.serverSoftware.trim() : '',
    version: typeof payload?.version === 'string' ? payload.version.trim() : '',
    status: typeof payload?.status === 'string' ? payload.status.trim() : '',
    discordUsername: typeof payload?.discordUsername === 'string' ? payload.discordUsername.trim() : '',
    productKey: typeof payload?.productKey === 'string' ? payload.productKey.trim() : '',
    consoleLog: typeof payload?.consoleLog === 'string' ? payload.consoleLog.trim() : '',
    description: typeof payload?.description === 'string' ? payload.description.trim() : '',
    title: typeof payload?.title === 'string' ? payload.title.trim() : '',
  }
  if (!['bug', 'compatibility', 'feature'].includes(fields.type)) {
    return respond({ error: 'Choose a valid report type' }, 400, origin)
  }

  const requiredByType = {
    bug: ['plugin', 'serverSoftware', 'version', 'description'],
    compatibility: ['plugin', 'serverSoftware', 'version', 'status', 'description'],
    feature: ['title', 'description'],
  }
  if (requiredByType[fields.type].some(field => !fields[field])) {
    return respond({ error: 'Fill in all required report fields' }, 400, origin)
  }
  if (fields.type === 'compatibility' && !['untested', 'broken', 'partial', 'working'].includes(fields.status)) {
    return respond({ error: 'Choose a valid compatibility status' }, 400, origin)
  }
  if (
    fields.type.length > 20 ||
    fields.plugin.length > 100 ||
    fields.serverSoftware.length > 100 ||
    fields.version.length > 60 ||
    fields.status.length > 20 ||
    fields.discordUsername.length > 100 ||
    fields.productKey.length > 200 ||
    fields.consoleLog.length > 2000 ||
    fields.description.length > 2000 ||
    fields.title.length > 120
  ) {
    return respond({ error: 'One or more report fields are too long' }, 400, origin)
  }

  const reportNames = {
    bug: 'Bug Report',
    compatibility: 'Compatibility Report',
    feature: 'Feature Request',
  }
  const embedField = (name, value, maxLength) => ({
    name,
    value: cleanReportValue(value, maxLength) || 'Not provided',
    inline: false,
  })
  const fieldsByType = {
    bug: [
      embedField('Plugin', fields.plugin, 100),
      embedField('Discord username', fields.discordUsername, 100),
      embedField('Server software', fields.serverSoftware, 100),
      embedField('Version number', fields.version, 60),
      embedField('Product key', fields.productKey, 200),
      embedField('Console log message', fields.consoleLog, 2000),
      embedField('What happened', fields.description, 2000),
    ],
    compatibility: [
      embedField('Plugin', fields.plugin, 100),
      embedField('Server software', fields.serverSoftware, 100),
      embedField('Version number', fields.version, 60),
      embedField('Compatibility status', fields.status, 20),
      embedField('Details', fields.description, 2000),
    ],
    feature: [
      embedField('Request', fields.title, 120),
      embedField('Plugin', fields.plugin, 100),
      embedField('Discord username', fields.discordUsername, 100),
      embedField('Description and use case', fields.description, 2000),
    ],
  }
  const report = {
    username: 'Lumen Studios Reports',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `New ${reportNames[fields.type]}`,
      color: 0x7B3FF2,
      fields: fieldsByType[fields.type],
      timestamp: new Date().toISOString(),
      footer: { text: `Lumen Studios Reports · ${fields.type}` },
    }],
  }

  let upstream
  try {
    upstream = await fetch(env.DISCORD_BUG_REPORT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    return respond({ error: 'Could not deliver the report. Please try again later.' }, 502, origin)
  }

  if (!upstream.ok) {
    return respond({ error: 'Could not deliver the report. Please try again later.' }, 502, origin)
  }

  return respond({ ok: true }, 200, origin)
}

async function dinosaurDiscoveries(request, env, origin) {
  if (!env.DINO_DISCOVERIES) {
    return respond({ error: 'Dinosaur discovery counter is not configured' }, 503, origin)
  }

  const ip = request.headers.get('CF-Connecting-IP')
  if (!ip) return respond({ error: 'Request could not be verified' }, 400, origin)
  const rateLimit = await env.ASSISTANT_LIMITER.limit({ key: `dinosaur-discoveries:${ip}` })
  if (!rateLimit.success) {
    return respond({ error: 'Please wait before checking the dinosaur counter again' }, 429, origin)
  }

  let visitorId = ''
  if (request.method === 'POST') {
    const body = await request.text()
    if (body.length > 200) return respond({ error: 'Request is too large' }, 413, origin)

    let payload
    try {
      payload = JSON.parse(body)
    } catch {
      return respond({ error: 'Expected a JSON request' }, 400, origin)
    }

    visitorId = typeof payload?.visitorId === 'string' ? payload.visitorId : ''
    if (!/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(visitorId)) {
      return respond({ error: 'A valid visitor ID is required' }, 400, origin)
    }
  }

  try {
    if (request.method === 'POST') {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(visitorId))
      const visitorHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
      await env.DINO_DISCOVERIES
        .prepare('INSERT OR IGNORE INTO dinosaur_discoverers (visitor_hash, found_at) VALUES (?, ?)')
        .bind(visitorHash, new Date().toISOString())
        .run()
    }

    const result = await env.DINO_DISCOVERIES
      .prepare('SELECT COUNT(*) AS count FROM dinosaur_discoverers')
      .first()
    return respond({ count: Number(result?.count ?? 0) }, 200, origin)
  } catch (error) {
    console.error('Dinosaur discovery counter database request failed:', error)
    return respond({ error: 'Dinosaur discovery counter is temporarily unavailable' }, 503, origin)
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin')
    if (!origin || origin !== env.ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403 })
    }

    const path = new URL(request.url).pathname
    if (path !== '/chat' && path !== '/bug-report' && path !== '/reports' && path !== '/dinosaur-discoveries') {
      return respond({ error: 'Not found' }, 404, origin)
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': path === '/dinosaur-discoveries' ? 'GET, POST, OPTIONS' : 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        },
      })
    }

    if (path === '/dinosaur-discoveries') {
      if (request.method !== 'GET' && request.method !== 'POST') {
        return respond({ error: 'Method not allowed' }, 405, origin)
      }
      return dinosaurDiscoveries(request, env, origin)
    }

    if (request.method !== 'POST') {
      return respond({ error: 'Method not allowed' }, 405, origin)
    }

    if (path === '/bug-report' || path === '/reports') {
      return submitReport(request, env, origin)
    }

    if (!env.DEEPSEEK_API_KEY) {
      return respond({ error: 'Assistant is not configured' }, 503, origin)
    }

    const ip = request.headers.get('CF-Connecting-IP')
    if (!ip) return respond({ error: 'Request could not be verified' }, 400, origin)

    const rateLimit = await env.ASSISTANT_LIMITER.limit({ key: ip })
    if (!rateLimit.success) {
      return respond({ error: 'Please wait a moment before asking another question' }, 429, origin)
    }

    const body = await request.text()
    if (body.length > 6000) {
      return respond({ error: 'Request is too large' }, 413, origin)
    }

    let payload
    try {
      payload = JSON.parse(body)
    } catch {
      return respond({ error: 'Expected a JSON request' }, 400, origin)
    }

    const question = typeof payload?.question === 'string' ? payload.question.trim() : ''
    const context = Array.isArray(payload?.context) ? payload.context.slice(0, 4) : []
    if (!question || question.length > 500) {
      return respond({ error: 'Question must be between 1 and 500 characters' }, 400, origin)
    }

    const excerpts = context
      .filter(item => typeof item?.title === 'string' && typeof item?.text === 'string')
      .slice(0, 4)
      .map(item => `## ${item.title.slice(0, 80)}\n${item.text.slice(0, 1000)}`)
      .join('\n\n')
      .slice(0, 4200)

    let upstream
    try {
      upstream = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          temperature: 0.3,
          max_tokens: 90,
          messages: [
            {
              role: 'system',
              content: 'You are Lumen Studios’ Minecraft plugin docs assistant. Reply in at most 2 short bullets and 40 words. Use only supplied docs; never guess commands, permissions, versions, settings, or behavior. If unknown, say so and point to https://discord.gg/lumenstudios.',
            },
            { role: 'user', content: `Documentation excerpts:\n${excerpts || '(No matching excerpts found.)'}\n\nQuestion:\n${question}` },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      })
    } catch {
      return respond({ error: 'Assistant provider is temporarily unavailable' }, 502, origin)
    }

    if (!upstream.ok) {
      return respond({ error: 'Assistant provider returned an error' }, 502, origin)
    }

    let result
    try {
      result = await upstream.json()
    } catch {
      return respond({ error: 'Assistant provider returned an invalid response' }, 502, origin)
    }

    const answer = result?.choices?.[0]?.message?.content
    if (typeof answer !== 'string' || !answer.trim()) {
      return respond({ error: 'Assistant provider returned an empty answer' }, 502, origin)
    }

    return respond({ answer: answer.trim() }, 200, origin)
  },
}
