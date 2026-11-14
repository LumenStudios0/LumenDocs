export function safeUrl(value, image = false) {
  try {
    if (typeof value !== 'string' || /[\u0000-\u0020]/.test(value)) return ''
    const url = new URL(value)
    return (!url.username && !url.password && (image ? url.protocol === 'https:' : ['https:', 'http:', 'mailto:'].includes(url.protocol))) ? url.href : ''
  } catch { return '' }
}

const colors = new Set(['purple', 'red', 'green', 'blue', 'orange', 'pink'])

export function parseInline(text, depth = 0) {
  if (depth > 8) return [{ type: 'text', text }]
  const result = []
  const pattern = /(\[color=([a-z]+)\]([\s\S]*?)\[\/color\]|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|\*([^*\n]+)\*|`([^`\n]+)`)/gi
  let end = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > end) result.push({ type: 'text', text: text.slice(end, match.index) })
    if (match[2] && colors.has(match[2].toLowerCase())) result.push({ type: 'color', color: match[2].toLowerCase(), children: parseInline(match[3], depth + 1) })
    else if (match[4] && safeUrl(match[5])) result.push({ type: 'link', url: safeUrl(match[5]), children: parseInline(match[4], depth + 1) })
    else if (match[6]) result.push({ type: 'strong', children: parseInline(match[6], depth + 1) })
    else if (match[7]) result.push({ type: 'strike', children: parseInline(match[7], depth + 1) })
    else if (match[8]) result.push({ type: 'em', children: parseInline(match[8], depth + 1) })
    else if (match[9]) result.push({ type: 'code', text: match[9] })
    else result.push({ type: 'text', text: match[0] })
    end = match.index + match[0].length
  }
  if (end < text.length) result.push({ type: 'text', text: text.slice(end) })
  return result
}

export function parseRichText(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^```/.test(line)) {
      const code = []
      while (++i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i])
      blocks.push({ type: 'pre', text: code.join('\n') })
    } else if (/^#{1,3}\s+/.test(line)) {
      const match = /^(#{1,3})\s+(.*)$/.exec(line)
      blocks.push({ type: 'heading', level: match[1].length, children: parseInline(match[2]) })
    } else if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
      const items = []
      const ordered = /^\s*\d+\.\s+/.test(line)
      const listPattern = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/
      do { items.push(parseInline(lines[i].replace(listPattern, ''))); i++ } while (i < lines.length && listPattern.test(lines[i]))
      i--
      blocks.push({ type: 'list', ordered, items })
    } else if (line) blocks.push({ type: 'paragraph', children: parseInline(line) })
    else blocks.push({ type: 'break' })
  }
  return blocks
}
