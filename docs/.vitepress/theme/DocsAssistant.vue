<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { withBase } from 'vitepress'

interface DocSection {
  title: string
  text: string
  href: string
  route: string
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
    const text = lines.slice(heading.start + 1, end).join(' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[`*_>#|[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const title = heading.title
    return {
      title,
      text,
      href: `${withBase(route)}#${heading.slug}`,
      route,
      searchableText: `${title} ${text}`.toLowerCase(),
    }
  }).filter(section => section.text.length > 0)
})

const open = ref(false)
const query = ref('')
const answers = ref<Answer[]>([])
const input = ref<HTMLInputElement | null>(null)
const conversation = ref<HTMLDivElement | null>(null)
const searching = ref(false)
const hasQuestion = computed(() => answers.value.length > 0)
const clickSounds = ref(true)
const ambientMusic = ref(false)
const activeMusicTrack = ref('')
const assistantEndpoint = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
let audioContext: AudioContext | undefined
let musicMaster: GainNode | undefined
let musicFilter: BiquadFilterNode | undefined
let musicOscillators: OscillatorNode[] = []
let musicSources: AudioScheduledSourceNode[] = []
let musicTimer: number | undefined
let noteTimer: number | undefined
let rainTimer: number | undefined
let musicChordIndex = 0
let musicNoteIndex = 0
let lastMusicTrack = -1
let activeTrack: AmbientTrack | undefined

interface AmbientTrack {
  name: string
  description: string
  chords: number[][]
  waveform: OscillatorType
  filterFrequency: number
  chordInterval: number
  chordVolume: number
  texture?: {
    filter: BiquadFilterType
    frequency: number
    volume: number
    pulse?: number
  }
  rain?: boolean
  notes?: {
    frequencies: number[]
    waveform: OscillatorType
    volume: number
    attack: number
    decay: number
    interval: number
    partials?: { ratio: number; level: number }[]
  }
}

const ambientTracks: AmbientTrack[] = [
  {
    name: 'Tides',
    description: 'Low, slow sine-wave chords with a gentle pulsing undertone, inspired by rolling waves.',
    waveform: 'sine',
    filterFrequency: 560,
    chordInterval: 6800,
    chordVolume: 0.12,
    texture: { filter: 'lowpass', frequency: 420, volume: 0.035, pulse: 0.016 },
    chords: [
      [130.81, 164.81, 196, 246.94],
      [110, 146.83, 174.61, 220],
      [123.47, 155.56, 196, 233.08],
      [98, 130.81, 164.81, 196],
    ],
  },
  {
    name: 'Mountain Wind',
    description: 'Open, widely spaced triangle-wave chords over a soft, slowly swelling airy texture.',
    waveform: 'triangle',
    filterFrequency: 390,
    chordInterval: 8200,
    chordVolume: 0.1,
    texture: { filter: 'lowpass', frequency: 280, volume: 0.07, pulse: 0.045 },
    chords: [
      [110, 164.81, 220, 329.63],
      [98, 146.83, 196, 293.66],
      [123.47, 185, 246.94, 369.99],
      [87.31, 130.81, 174.61, 261.63],
    ],
  },
  {
    name: 'Forest',
    description: 'A warmer mid-range triangle-wave melody over soft chords and a subtle woodland-like texture.',
    waveform: 'triangle',
    filterFrequency: 1100,
    chordInterval: 5200,
    chordVolume: 0.09,
    texture: { filter: 'bandpass', frequency: 850, volume: 0.018, pulse: 0.012 },
    notes: {
      frequencies: [392, 493.88, 587.33, 493.88, 440, 587.33, 659.25, 587.33],
      waveform: 'triangle',
      volume: 0.07,
      attack: 0.04,
      decay: 0.65,
      interval: 1900,
    },
    chords: [
      [146.83, 174.61, 220, 261.63],
      [130.81, 164.81, 196, 246.94],
      [155.56, 185, 233.08, 293.66],
      [138.59, 174.61, 207.65, 261.63],
    ],
  },
  {
    name: 'Rain',
    description: 'Quiet sustained chords with sparse, soft synthesized droplets rather than continuous noise.',
    waveform: 'sine',
    filterFrequency: 760,
    chordInterval: 9000,
    chordVolume: 0.055,
    rain: true,
    chords: [
      [130.81, 196, 261.63],
      [146.83, 220, 293.66],
      [123.47, 185, 246.94],
      [110, 164.81, 220],
    ],
  },
  {
    name: 'Starlight',
    description: 'High, bell-like sine notes and bright, spacious chords with long, gentle decays.',
    waveform: 'sine',
    filterFrequency: 1800,
    chordInterval: 6200,
    chordVolume: 0.08,
    notes: {
      frequencies: [987.77, 783.99, 1174.66, 880, 1318.51, 1046.5],
      waveform: 'sine',
      volume: 0.12,
      attack: 0.08,
      decay: 2.8,
      interval: 2800,
      partials: [
        { ratio: 2.01, level: 0.3 },
        { ratio: 3.92, level: 0.08 },
      ],
    },
    chords: [
      [261.63, 329.63, 392, 493.88],
      [293.66, 369.99, 440, 554.37],
      [246.94, 311.13, 392, 493.88],
      [220, 329.63, 392, 523.25],
    ],
  },
]

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
  const currentPath = window.location.pathname.replace(/\/$/, '') || '/'
  const currentPageText = sections
    .filter(section => (section.route.replace(/\/$/, '') || '/') === currentPath)
    .map(section => `${section.title}: ${section.text}`)
    .join('\n')
  const context = results
    .filter(section => (section.route.replace(/\/$/, '') || '/') !== currentPath)
    .slice(0, 2)
    .map(result => ({ title: result.title, text: result.text.slice(0, 1000) }))

  if (currentPageText) {
    context.push({ title: 'Current page', text: currentPageText.slice(0, 1000) })
  }
  if (/\b(site|music|sound|theme|assistant|shortcut|keyboard|wave|branding)\b/i.test(question)) {
    context.push({
      title: 'Site and soundtrack details',
      text: `Lumen Studios docs use purple branding, animated waves, browser navigation, and copy buttons. Shortcuts: / opens search; Ctrl/⌘+Shift+A opens the assistant; Escape closes it. Optional soundscapes: ${ambientTracks.map(track => `${track.name}—${track.description}`).join(' ')} Currently playing: ${activeTrack?.name ?? 'none'}.`,
    })
  }

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
          context: context.slice(0, 4),
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
  await nextTick()
  conversation.value?.scrollTo({
    top: conversation.value.scrollHeight,
    behavior: 'smooth',
  })
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
  const tone = audioContext.createOscillator()
  const volume = audioContext.createGain()
  tone.type = 'sine'
  tone.frequency.setValueAtTime(330, now)
  tone.frequency.exponentialRampToValueAtTime(220, now + 0.09)
  volume.gain.setValueAtTime(0.0001, now)
  volume.gain.exponentialRampToValueAtTime(0.009, now + 0.012)
  volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)
  tone.connect(volume)
  volume.connect(audioContext.destination)
  tone.start(now)
  tone.stop(now + 0.11)
}

function toggleClickSounds() {
  clickSounds.value = !clickSounds.value
  try {
    localStorage.setItem('lumen-click-sounds', String(clickSounds.value))
  } catch {
    // Keep the setting for this page view when browser storage is unavailable.
  }
}

function startAmbientMusic() {
  const AudioContextConstructor = window.AudioContext
  if (!AudioContextConstructor) return

  audioContext ??= new AudioContextConstructor()
  void audioContext.resume()

  const now = audioContext.currentTime
  const availableTracks = ambientTracks
    .map((_, index) => index)
    .filter(index => index !== lastMusicTrack)
  const trackIndex = availableTracks[Math.floor(Math.random() * availableTracks.length)]
  activeTrack = ambientTracks[trackIndex]
  activeMusicTrack.value = activeTrack.name
  lastMusicTrack = trackIndex

  musicFilter = audioContext.createBiquadFilter()
  musicMaster = audioContext.createGain()
  musicFilter.type = 'lowpass'
  musicFilter.frequency.setValueAtTime(activeTrack.filterFrequency, now)
  musicMaster.gain.setValueAtTime(0.0001, now)
  musicMaster.gain.linearRampToValueAtTime(0.022, now + 2.5)
  musicFilter.connect(musicMaster)
  musicMaster.connect(audioContext.destination)

  for (const [index, frequency] of activeTrack.chords[0].entries()) {
    const tone = audioContext.createOscillator()
    const voice = audioContext.createGain()
    tone.type = activeTrack.waveform
    tone.frequency.setValueAtTime(frequency, now)
    tone.detune.setValueAtTime(index % 2 === 0 ? -2 : 2, now)
    voice.gain.setValueAtTime(activeTrack.chordVolume, now)
    tone.connect(voice)
    voice.connect(musicFilter)
    tone.start(now)
    musicOscillators.push(tone)
    musicSources.push(tone)
  }

  if (activeTrack.texture) {
    const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate)
    const samples = noiseBuffer.getChannelData(0)
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.random() * 2 - 1
    }

    const texture = audioContext.createBufferSource()
    const textureFilter = audioContext.createBiquadFilter()
    const textureVolume = audioContext.createGain()
    texture.buffer = noiseBuffer
    texture.loop = true
    textureFilter.type = activeTrack.texture.filter
    textureFilter.frequency.setValueAtTime(activeTrack.texture.frequency, now)
    textureVolume.gain.setValueAtTime(activeTrack.texture.volume, now)
    texture.connect(textureFilter)
    textureFilter.connect(textureVolume)
    textureVolume.connect(musicMaster)
    texture.start(now)
    musicSources.push(texture)

    if (activeTrack.texture.pulse) {
      const swell = audioContext.createOscillator()
      const swellDepth = audioContext.createGain()
      swell.type = 'sine'
      swell.frequency.setValueAtTime(activeTrack.name === 'Forest' ? 0.18 : 0.08, now)
      swellDepth.gain.setValueAtTime(activeTrack.texture.pulse, now)
      swell.connect(swellDepth)
      swellDepth.connect(textureVolume.gain)
      swell.start(now)
      musicSources.push(swell)
    }
  }

  if (activeTrack.rain) {
    const playRaindrop = () => {
      if (!audioContext || !musicMaster || activeTrack?.name !== 'Rain') return

      const dropAt = audioContext.currentTime
      const drop = audioContext.createOscillator()
      const dropVolume = audioContext.createGain()
      drop.type = 'sine'
      drop.frequency.setValueAtTime(1150 + Math.random() * 850, dropAt)
      drop.frequency.exponentialRampToValueAtTime(520 + Math.random() * 300, dropAt + 0.11)
      dropVolume.gain.setValueAtTime(0.0001, dropAt)
      dropVolume.gain.exponentialRampToValueAtTime(0.16, dropAt + 0.004)
      dropVolume.gain.exponentialRampToValueAtTime(0.0001, dropAt + 0.12)
      drop.connect(dropVolume)
      dropVolume.connect(musicMaster)
      drop.start(dropAt)
      drop.stop(dropAt + 0.13)

      rainTimer = window.setTimeout(playRaindrop, 260 + Math.random() * 720)
    }

    rainTimer = window.setTimeout(playRaindrop, 300)
  }

  musicChordIndex = 0
  musicTimer = window.setInterval(() => {
    if (!audioContext || !activeTrack) return
    musicChordIndex = (musicChordIndex + 1) % activeTrack.chords.length
    const chord = activeTrack.chords[musicChordIndex]
    const changeAt = audioContext.currentTime
    musicOscillators.forEach((tone, index) => {
      tone.frequency.cancelScheduledValues(changeAt)
      tone.frequency.setTargetAtTime(chord[index], changeAt, 0.8)
    })
  }, activeTrack.chordInterval)

  musicNoteIndex = 0
  if (activeTrack.notes) {
    const playTrackNote = () => {
      if (!audioContext || !activeTrack?.notes || !musicFilter) return
      const instrument = activeTrack.notes
      const changeAt = audioContext.currentTime
      const frequency = instrument.frequencies[musicNoteIndex % instrument.frequencies.length]
      musicNoteIndex += 1
      const partials = [{ ratio: 1, level: 1 }, ...(instrument.partials ?? [])]

      for (const partial of partials) {
        const note = audioContext.createOscillator()
        const noteVolume = audioContext.createGain()
        note.type = instrument.waveform
        note.frequency.setValueAtTime(frequency * partial.ratio, changeAt)
        noteVolume.gain.setValueAtTime(0.0001, changeAt)
        noteVolume.gain.linearRampToValueAtTime(instrument.volume * partial.level, changeAt + instrument.attack)
        noteVolume.gain.exponentialRampToValueAtTime(0.0001, changeAt + instrument.decay)
        note.connect(noteVolume)
        noteVolume.connect(musicFilter)
        note.start(changeAt)
        note.stop(changeAt + instrument.decay + 0.05)
      }
    }

    playTrackNote()
    noteTimer = window.setInterval(playTrackNote, activeTrack.notes.interval)
  }

}

function stopAmbientMusic() {
  if (!audioContext || !musicMaster) return

  window.clearInterval(musicTimer)
  musicTimer = undefined
  window.clearInterval(noteTimer)
  noteTimer = undefined
  window.clearTimeout(rainTimer)
  rainTimer = undefined
  const now = audioContext.currentTime
  musicMaster.gain.cancelScheduledValues(now)
  musicMaster.gain.setValueAtTime(musicMaster.gain.value, now)
  musicMaster.gain.linearRampToValueAtTime(0.0001, now + 1.2)
  for (const source of musicSources) source.stop(now + 1.25)
  musicOscillators = []
  musicSources = []
  musicMaster = undefined
  musicFilter = undefined
  activeTrack = undefined
  activeMusicTrack.value = ''
}

function toggleAmbientMusic() {
  ambientMusic.value = !ambientMusic.value
  if (ambientMusic.value) startAmbientMusic()
  else stopAmbientMusic()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    open.value = false
    return
  }
  const target = event.target
  const isEditing = target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  if (
    !isEditing &&
    event.key.toLowerCase() === 'a' &&
    event.shiftKey &&
    (event.ctrlKey || event.metaKey)
  ) {
    event.preventDefault()
    focusInput()
  }
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
  window.clearInterval(musicTimer)
  window.clearInterval(noteTimer)
  window.clearTimeout(rainTimer)
  for (const source of musicSources) source.stop()
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
    <button
      v-if="!open"
      class="assistant-sound assistant-music"
      type="button"
      :aria-label="ambientMusic ? `Turn off ${activeMusicTrack} music` : 'Play a random ambient soundscape'"
      :aria-pressed="ambientMusic"
      :title="ambientMusic ? `Now playing: ${activeMusicTrack} (click to stop)` : 'Play a random ambient soundscape'"
      @click="toggleAmbientMusic"
    >
      {{ ambientMusic ? '♫' : '♬' }}
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
          <button
            class="assistant-sound assistant-music"
            type="button"
            :aria-label="ambientMusic ? `Turn off ${activeMusicTrack} music` : 'Play a random ambient soundscape'"
            :aria-pressed="ambientMusic"
            :title="ambientMusic ? `Now playing: ${activeMusicTrack} (click to stop)` : 'Play a random ambient soundscape'"
            @click="toggleAmbientMusic"
          >
            {{ ambientMusic ? '♫' : '♬' }}
          </button>
          <button class="assistant-close" type="button" aria-label="Close assistant" @click="open = false">×</button>
        </div>
      </header>

      <div ref="conversation" class="assistant-conversation" aria-live="polite">
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
        {{ assistantEndpoint ? 'Questions and selected guide excerpts are sent to DeepSeek. Full plugin source code and ZIP archives are not sent.' : 'Local guide search is active. AI replies need a secure backend.' }}
      </p>
    </section>
  </div>
</template>
