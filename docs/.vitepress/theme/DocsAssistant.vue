<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { withBase } from 'vitepress'

interface DocSection {
  title: string
  text: string
  href: string
  searchableText: string
}

interface Answer {
  question: string
  results: DocSection[]
  reply: string
}

interface AssistantApiResponse {
  answer?: unknown
}

const sourceFiles = import.meta.glob('../../**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const sections: DocSection[] = Object.entries(sourceFiles).flatMap(([file, source]) => {
  const relativePath = file.replace(/^(?:\.\.\/)+/, '').replace(/\.md$/, '')
  const route = relativePath === 'index'
    ? '/'
    : `/${relativePath.replace(/\/index$/, '/')}`
  const lines = source.replace(/^---[\s\S]*?---\s*/, '').split('\n')
  const headings: { title: string; slug: string; start: number }[] = []

  lines.forEach((line, index) => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (!heading) return

    const title = heading[2].replace(/[`*_]/g, '').trim()
    const slug = title.toLowerCase().replace(/[^\w -]/g, '').replace(/\s+/g, '-')
    headings.push({ title, slug, start: index })
  })

  return headings.map((heading, index) => {
    const end = headings[index + 1]?.start ?? lines.length
    const text = lines.slice(heading.start + 1, end).join(' ').replace(/[`*_>#|[\]()]/g, ' ').replace(/\s+/g, ' ').trim()
    const title = heading.title
    return {
      title,
      text,
      href: `${withBase(route)}#${heading.slug}`,
      searchableText: `${title} ${text}`.toLowerCase(),
    }
  }).filter(section => section.text.length > 0)
})

const open = ref(false)
const query = ref('')
const answers = ref<Answer[]>([])
const input = ref<HTMLInputElement | null>(null)
const searching = ref(false)
const hasQuestion = computed(() => answers.value.length > 0)
const clickSounds = ref(true)
const assistantEndpoint = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
let audioContext: AudioContext | undefined

function findSections(question: string): DocSection[] {
  const terms = question.toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) ?? []
  const filteredTerms = terms.filter(term => term.length > 2)
  const ranked = sections.map(section => {
    const content = section.searchableText
    const title = section.title.toLowerCase()
    const score = filteredTerms.reduce((total, term) => {
      const count = content.split(term).length - 1
      return total + Math.min(count, 5) + (title.includes(term) ? 4 : 0)
    }, 0) + (question.length > 5 && content.includes(question.toLowerCase()) ? 8 : 0)
    return { section, score }
  })

  return ranked
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(result => result.section)
}

async function askQuestion() {
  const question = query.value.trim()
  if (!question || searching.value) return

  searching.value = true
  const results = findSections(question)
  let reply = results.length
    ? `I found ${results.length === 1 ? 'a useful guide' : 'some useful sections'} for that. Open the links below for step-by-step details.`
    : 'I couldn’t find a close match in the docs. Try including the plugin name or a specific command, or ask for help in our Discord.'

  if (assistantEndpoint) {
    try {
      const response = await fetch(assistantEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context: results.slice(0, 5).map(result => ({ title: result.title, text: result.text.slice(0, 1800) })),
        }),
      })
      if (!response.ok) throw new Error(`Assistant request failed with status ${response.status}`)

      const payload = await response.json() as AssistantApiResponse
      if (typeof payload.answer !== 'string' || payload.answer.trim().length === 0) {
        throw new Error('Assistant returned an empty answer')
      }
      reply = payload.answer.trim()
    } catch (error) {
      console.error('Lumen Docs Assistant request failed:', error)
      reply = 'The AI assistant is temporarily unavailable. Here are the closest matching guides instead.'
    }
  }

  answers.value.push({ question, results, reply })
  query.value = ''
  searching.value = false
}

function focusInput() {
  open.value = true
  requestAnimationFrame(() => input.value?.focus())
}

function playClickSound(event: MouseEvent) {
  if (!clickSounds.value || !(event.target instanceof Element)) return
  if (!event.target.closest('a, button, [role="button"], summary')) return

  const AudioContextConstructor = window.AudioContext
  if (!AudioContextConstructor) return

  audioContext ??= new AudioContextConstructor()
  void audioContext.resume()
  const now = audioContext.currentTime

  const playTone = (frequency: number, start: number, duration: number, peak: number) => {
    const oscillator = audioContext!.createOscillator()
    const volume = audioContext!.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, now + start)
    volume.gain.setValueAtTime(0.0001, now + start)
    volume.gain.exponentialRampToValueAtTime(peak, now + start + 0.005)
    volume.gain.exponentialRampToValueAtTime(0.0001, now + start + duration)
    oscillator.connect(volume)
    volume.connect(audioContext!.destination)
    oscillator.start(now + start)
    oscillator.stop(now + start + duration + 0.005)
  }

  playTone(520, 0, 0.075, 0.022)
  playTone(880, 0.012, 0.06, 0.012)
}

function toggleClickSounds() {
  clickSounds.value = !clickSounds.value
  try {
    localStorage.setItem('lumen-click-sounds', String(clickSounds.value))
  } catch {
    // Keep the setting for this page view when browser storage is unavailable.
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  try {
    clickSounds.value = localStorage.getItem('lumen-click-sounds') !== 'false'
  } catch {
    clickSounds.value = true
  }
  document.addEventListener('click', playClickSound, true)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', playClickSound, true)
  window.removeEventListener('keydown', onKeydown)
  void audioContext?.close()
})
</script>

<template>
  <div class="lumen-assistant">
    <button
      v-if="!open"
      class="assistant-launcher"
      type="button"
      aria-label="Ask the Lumen Docs Assistant"
      @click="focusInput"
    >
      <span class="assistant-spark" aria-hidden="true">✦</span>
      <span>Ask the docs</span>
    </button>
    <button
      v-if="!open"
      class="assistant-sound"
      type="button"
      :aria-label="clickSounds ? 'Turn off click sounds' : 'Turn on click sounds'"
      :title="clickSounds ? 'Turn off click sounds' : 'Turn on click sounds'"
      @click="toggleClickSounds"
    >
      {{ clickSounds ? '♪' : '♩' }}
    </button>
    <section v-if="open" class="assistant-panel" aria-label="Lumen Docs Assistant">
      <header class="assistant-header">
        <div>
          <strong>Lumen Docs Assistant</strong>
          <span>Answers from the published guides</span>
        </div>
        <div class="assistant-header-actions">
          <button
            class="assistant-sound"
            type="button"
            :aria-label="clickSounds ? 'Turn off click sounds' : 'Turn on click sounds'"
            :title="clickSounds ? 'Turn off click sounds' : 'Turn on click sounds'"
            @click="toggleClickSounds"
          >
            {{ clickSounds ? '♪' : '♩' }}
          </button>
          <button class="assistant-close" type="button" aria-label="Close assistant" @click="open = false">×</button>
        </div>
      </header>

      <div class="assistant-conversation" aria-live="polite">
        <p v-if="!hasQuestion" class="assistant-welcome">
          What are you setting up? Ask about commands, permissions, versions, configuration, or troubleshooting.
        </p>
        <article v-for="(answer, index) in answers" :key="`${index}-${answer.question}`" class="assistant-answer">
          <p class="assistant-question">{{ answer.question }}</p>
          <p class="assistant-response">{{ answer.reply }}</p>
          <a
            v-for="result in answer.results"
            :key="result.href"
            class="assistant-result"
            :href="result.href"
          >
            <strong>{{ result.title }}</strong>
            <span>{{ result.text.slice(0, 220) }}{{ result.text.length > 220 ? '…' : '' }}</span>
            <small>Open guide ↗</small>
          </a>
        </article>
      </div>

      <form class="assistant-form" @submit.prevent="askQuestion">
        <input
          ref="input"
          v-model="query"
          type="text"
          placeholder="Ask about a plugin..."
          aria-label="Ask a question about Lumen plugins"
          autocomplete="off"
        >
        <button type="submit" :disabled="!query.trim() || searching">{{ searching ? 'Thinking…' : 'Ask' }}</button>
      </form>
      <p class="assistant-note">
        {{ assistantEndpoint ? 'Questions and matching guide excerpts are sent to DeepSeek for replies.' : 'Local guide search is active. AI replies need a secure backend.' }}
      </p>
    </section>
  </div>
</template>
