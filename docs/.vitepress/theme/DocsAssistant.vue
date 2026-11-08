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
    .slice(0, 3)
    .map(result => result.section)
}

function askQuestion() {
  const question = query.value.trim()
  if (!question || searching.value) return

  searching.value = true
  answers.value.push({ question, results: findSections(question) })
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
  const oscillator = audioContext.createOscillator()
  const volume = audioContext.createGain()
  const now = audioContext.currentTime

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(740, now)
  volume.gain.setValueAtTime(0.0001, now)
  volume.gain.exponentialRampToValueAtTime(0.025, now + 0.006)
  volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.035)
  oscillator.connect(volume)
  volume.connect(audioContext.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.04)
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
          <p v-if="answer.results.length" class="assistant-response">Here are the closest matches in the docs:</p>
          <p v-else class="assistant-response">
            I couldn’t find a close match. Try a plugin name or a specific topic, or ask for help in
            <a href="https://discord.gg/lumenstudios" target="_blank" rel="noreferrer">our Discord</a>.
          </p>
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
        <button type="submit" :disabled="!query.trim() || searching">Ask</button>
      </form>
      <p class="assistant-note">Searches these docs locally; your question isn’t sent to an AI service.</p>
    </section>
  </div>
</template>
