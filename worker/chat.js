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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin')
    if (!origin || origin !== env.ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403 })
    }

    if (new URL(request.url).pathname !== '/chat') {
      return respond({ error: 'Not found' }, 404, origin)
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        },
      })
    }

    if (request.method !== 'POST') {
      return respond({ error: 'Method not allowed' }, 405, origin)
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
    if (body.length > 12000) {
      return respond({ error: 'Request is too large' }, 413, origin)
    }

    let payload
    try {
      payload = JSON.parse(body)
    } catch {
      return respond({ error: 'Expected a JSON request' }, 400, origin)
    }

    const question = typeof payload?.question === 'string' ? payload.question.trim() : ''
    const context = Array.isArray(payload?.context) ? payload.context.slice(0, 3) : []
    if (!question || question.length > 1000) {
      return respond({ error: 'Question must be between 1 and 1000 characters' }, 400, origin)
    }

    const excerpts = context
      .filter(item => typeof item?.title === 'string' && typeof item?.text === 'string')
      .map(item => `## ${item.title.slice(0, 100)}\n${item.text.slice(0, 1200)}`)
      .join('\n\n')
      .slice(0, 4000)

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
          max_tokens: 700,
          messages: [
            {
              role: 'system',
              content: 'You are the Lumen Studios Minecraft plugin documentation assistant. Answer clearly and naturally using only the supplied documentation excerpts. For troubleshooting, give safe, practical checks in order. Never invent commands, permissions, versions, or configuration keys. If the excerpts do not answer the question, say what information is missing and direct the user to https://discord.gg/lumenstudios.',
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
