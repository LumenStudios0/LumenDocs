import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cachePath = resolve(root, '.github/builtbybit-updates.json')
const outputPath = resolve(root, 'docs/changelogs/updates.md')
const userAgent = 'LumenStudiosDocsChangelogBot/1.0 (+https://lumenstudio.fyi)'

export const products = [
  ['LumenAuction', 'lumenauction.132967', 'LumenAuction'],
  ['Gladiator', 'gladiator.132519', 'GLADIATOR'],
  ['LumenSpoofer', 'lumenspoof.135950', 'LumenSpoofer'],
  ['LumenDuels', 'lumenduels.119760', 'LumenDuels'],
  ['LumenDuels Premium', 'lumenduels-premium.132188', 'LumenDuels-Premium'],
  ['LumenBounty', 'lumenbounty.132973', null],
  ['LumenEconomy', 'lumeneconomy.132341', 'LumenEconomy'],
  ['LumenEssentials', 'lumenessentials.132966', 'LumenEssentials'],
  ['LumenOrder', 'lumenorders.132969', 'LumenOrders'],
  ['LumenShards', 'lumenshards.116897', 'LumenShards'],
  ['LumenSpawners', 'lumenspawners.132970', 'LumenSpawners'],
].map(([name, slug, repository]) => ({
  name,
  repository,
  url: `https://builtbybit.com/resources/${slug}/`,
}))

const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

function decodeHtml(text) {
  return text
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
}

function parseHtml(html) {
  const rootNode = { tag: '#root', attrs: {}, children: [] }
  const stack = [rootNode]

  for (const token of html.matchAll(/<!--[\s\S]*?-->|<\/?[a-z][^>]*>|[^<]+/gi)) {
    const value = token[0]
    if (value.startsWith('<!--')) continue
    if (!value.startsWith('<')) {
      stack.at(-1).children.push(decodeHtml(value))
      continue
    }

    const closing = /^<\//.test(value)
    const match = /^<\/?\s*([a-z][\w:-]*)\b([^>]*)>/i.exec(value)
    if (!match) continue
    const tag = match[1].toLowerCase()

    if (closing) {
      const index = stack.map(node => node.tag).lastIndexOf(tag)
      if (index > 0) stack.length = index
      continue
    }

    const attrs = {}
    for (const attr of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[attr[1].toLowerCase()] = decodeHtml(attr[2] ?? attr[3] ?? attr[4] ?? '')
    }
    const node = { tag, attrs, children: [] }
    stack.at(-1).children.push(node)
    if (!voidTags.has(tag) && !/\/\s*>$/.test(value)) stack.push(node)
  }

  return rootNode
}

function textContent(node) {
  if (typeof node === 'string') return node
  if (['script', 'style', 'svg', 'noscript'].includes(node.tag)) return ''
  return node.children.map(textContent).join(node.tag === 'br' ? '\n' : ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function descendants(node) {
  return node.children.flatMap(child => typeof child === 'string' ? [] : [child, ...descendants(child)])
}

function classes(node) {
  return (node.attrs.class ?? '').split(/\s+/)
}

function isUpdateContainer(node, includeMessages) {
  return classes(node).some(name =>
    /^(resourceUpdate|resource-update|resource-update-item|updateItem|update-item|update-entry|structItem--resourceUpdate)$/i.test(name) ||
    (includeMessages && name === 'message'),
  )
}

function collectNodes(node, output = []) {
  if (typeof node === 'string') return output
  output.push(node)
  node.children.forEach(child => collectNodes(child, output))
  return output
}

export function extractUpdateEntries(html, productUrl, pageUrl = productUrl) {
  const document = parseHtml(html)
  const nodes = collectNodes(document)
  const includeMessages = new URL(pageUrl).pathname.includes('/updates')
  const containers = nodes.filter(node =>
    isUpdateContainer(node, includeMessages) &&
    !descendants(node).some(child => isUpdateContainer(child, includeMessages)),
  )

  return containers.flatMap(container => {
    const nested = descendants(container)
    const titleNode = nested.find(node =>
      /^h[1-5]$/.test(node.tag) || classes(node).some(name => /(?:update.?title|structItem-title)/i.test(name)),
    )
    const title = titleNode ? textContent(titleNode) : ''
    const bodyNode = nested.find(node =>
      classes(node).some(name => /bbWrapper|message-body|update.?body|update.?content/i.test(name)),
    )
    const text = textContent(bodyNode ?? container)
    const timeNode = nested.find(node => node.tag === 'time' && node.attrs.datetime)
    const date = timeNode?.attrs.datetime ?? textContent(container).match(/\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2})\b/i)?.[0]
    const updateLink = nested.find(node =>
      node.tag === 'a' && /\/updates?\/|resource-update/i.test(node.attrs.href ?? ''),
    )
    const candidateUrl = updateLink?.attrs.href
      ? new URL(updateLink.attrs.href, productUrl)
      : new URL('updates/', productUrl)
    const href = candidateUrl.protocol === 'https:' && candidateUrl.hostname === 'builtbybit.com'
      ? candidateUrl.href
      : `${productUrl}updates/`

    if (!title || !date || text.length < 20) return []
    return [{ title, date, text, url: href, source: 'builtbybit' }]
  })
}

export async function fetchProductUpdates(product) {
  const baseUrl = new URL(product.url)
  const updateUrl = new URL('updates/', product.url)
  const urls = [updateUrl.href, product.url]
  const pages = []

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(20000),
      })
      if (!response.ok) {
        console.warn(`${product.name}: ${url} returned HTTP ${response.status}`)
        if (response.status === 403 || response.status === 429) break
        continue
      }
      const html = await response.text()
      const entries = extractUpdateEntries(html, baseUrl.href, url)
      pages.push(...entries)
      if (entries.length || url === product.url) break
    } catch (error) {
      console.warn(`${product.name}: could not fetch ${url}: ${error.message}`)
    }
  }

  return [...new Map(pages.map(entry => [`${entry.date}|${entry.title}`, entry])).values()]
}

async function fetchRepositoryUpdates(product, token) {
  if (!token || !product.repository) return []

  const url = `https://api.github.com/repos/LumenStudios0/${product.repository}/commits?per_page=20`
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': userAgent,
      },
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) {
      console.warn(`${product.name}: source repository returned HTTP ${response.status}`)
      return []
    }

    const commits = await response.json()
    return commits.flatMap(commit => {
      const title = commit.commit?.message?.split('\n')[0]?.trim()
      const date = commit.commit?.author?.date
      if (!title || !date || !commit.html_url) return []
      return [{
        title,
        date,
        text: title,
        url: commit.html_url,
        source: 'github',
      }]
    })
  } catch (error) {
    console.warn(`${product.name}: could not fetch source repository updates: ${error.message}`)
    return []
  }
}

function escapeMarkdown(text) {
  return text.replace(/([\\`*_{}[\]<>])/g, '\\$1')
}

function renderMarkdown(cache) {
  const sections = products.map(product => {
    const entries = cache[product.name] ?? []
    const content = entries.length
      ? entries.map(entry => {
        const source = entry.source === 'github' ? 'Source repository development update' : 'Official BuiltByBit update'
        return `### ${escapeMarkdown(entry.title)}\n\n**${escapeMarkdown(entry.date)}** · [${source} ↗](${entry.url})\n\n${escapeMarkdown(entry.text)}\n`
      }).join('\n')
      : '_No update entries have been published or could be verified for this product yet._'
    return `## ${product.name}\n\n${content}`
  })

  return [
    '# Recent product updates',
    '',
    'Official BuiltByBit updates are preferred. When a listing blocks automated access, recent source-repository commits are shown separately as development updates. The updater checks every 10 minutes; source availability and GitHub Actions scheduling may affect refresh timing.',
    '',
    ...sections.flatMap(section => [section, '']),
  ].join('\n').trimEnd() + '\n'
}

async function main() {
  let cache = {}
  try {
    cache = JSON.parse(await readFile(cachePath, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  let receivedEntries = 0
  const sourceToken = process.env.LUMEN_SOURCE_READ_TOKEN
  if (!sourceToken) {
    console.warn('LUMEN_SOURCE_READ_TOKEN is not configured; private repository fallback is disabled.')
  }
  for (const product of products) {
    const builtByBitEntries = await fetchProductUpdates(product)
    const repositoryEntries = await fetchRepositoryUpdates(product, sourceToken)
    const entries = [...builtByBitEntries, ...repositoryEntries]
    if (entries.length) {
      const combined = [...entries, ...(cache[product.name] ?? [])]
      cache[product.name] = [...new Map(combined.map(entry => [`${entry.source}|${entry.date}|${entry.title}`, entry])).values()]
        .sort((left, right) => String(right.date).localeCompare(String(left.date)))
        .slice(0, 100)
      receivedEntries += entries.length
      console.log(`${product.name}: found ${entries.length} update entr${entries.length === 1 ? 'y' : 'ies'}`)
    } else {
      console.log(`${product.name}: no verifiable update entries found; keeping previously collected entries`)
    }
  }

  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`)
  await writeFile(outputPath, renderMarkdown(cache))
  console.log(`Collected ${receivedEntries} entries in this refresh.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
