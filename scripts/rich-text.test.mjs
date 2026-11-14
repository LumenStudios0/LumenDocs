import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { parseRichText, parseInline, safeUrl } from '../docs/.vitepress/theme/rich-text.mjs'
test('headings, lists, color and code render as structured content', () => {
  const blocks = parseRichText('# One\n## Two\n### Three\n- **bold**\n[color=purple]hello[/color]\n```\n<img>\n```')
  assert.deepEqual(blocks.slice(0, 3).map(block => block.level), [1, 2, 3])
  assert.equal(blocks[3].items[0][0].type, 'strong')
  assert.equal(blocks[4].children[0].color, 'purple')
  assert.equal(blocks[5].text, '<img>')
  assert.equal(parseRichText('1. First\n2. Next')[0].ordered, true)
})
test('HTML and unsafe links stay inert text; image URLs require HTTPS', () => {
  assert.equal(parseInline('<img src=x onerror=alert(1)>')[0].type, 'text')
  assert.equal(parseInline('[x](javascript:alert)')[0].type, 'text')
  assert.equal(parseInline('[color=evil]x[/color]')[0].type, 'text')
  assert.equal(safeUrl('data:image/svg+xml,x', true), '')
  assert.equal(safeUrl('http://example.com/image.png', true), '')
  assert.equal(safeUrl('https://user:password@example.com/image.png', true), '')
  assert.equal(parseInline('[x](https://example.com)')[0].type, 'link')
})
