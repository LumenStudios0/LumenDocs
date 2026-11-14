<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { clearDiscordSession, getDiscordSession, storeDiscordSession } from './discord-session'
import { communityRequest } from './community-api'

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

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
  tracklist?: boolean
}

interface AssistantApiResponse {
  answer?: unknown
}

interface DiscordUser {
  id: string
  username: string
  globalName: string
  avatarUrl: string
  expiresAt: number
  role?: 'owner' | 'studio_lead' | 'admin' | null
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
const assistantView = ref<'chat' | 'bug-report'>('chat')
const bugReport = ref({
  plugin: '',
  serverSoftware: '',
  version: '',
  consoleLog: '',
  description: '',
})
const submittingBugReport = ref(false)
const bugReportError = ref('')
const bugReportSent = ref(false)
const clickSounds = ref(true)
const ambientMusic = ref(false)
const musicVolume = ref(35)
const musicAnimationsEnabled = ref(true)
const activeMusicTrack = ref('')
const selectedMusicTrack = ref('')
const discordUser = ref<DiscordUser | null>(null)
const discordAuthNotice = ref('')
const accountMenuOpen = ref(false)
const loginModalOpen = ref(false)
const loginDialog = ref<HTMLElement | null>(null)
let loginReturnFocus: HTMLElement | null = null
const trackPositionSeconds = ref(0)
const assistantEndpoint = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
let audioContext: AudioContext | undefined
let musicMaster: GainNode | undefined
let musicOutput: GainNode | undefined
let musicFilter: BiquadFilterNode | undefined
let musicOscillators: OscillatorNode[] = []
let musicSources: AudioScheduledSourceNode[] = []
let musicTimer: number | undefined
let noteTimer: number | undefined
let progressTimer: number | undefined
let rainTimer: number | undefined
let monkeyTimer: number | undefined
let minecraftTimer: number | undefined
let rhythmTimer: number | undefined
let musicChordIndex = 0
let musicNoteIndex = 0
let rhythmStepIndex = 0
let lastMusicTrack = -1
let activeTrack: AmbientTrack | undefined
let musicStarting = false
let trackPositionOffsetSeconds = 0
let trackPositionStartedAt = 0

function getAudioContextConstructor() {
  return window.AudioContext ?? window.webkitAudioContext
}

interface AmbientTrack {
  name: string
  description: string
  secret?: boolean
  rareChance?: number
  modeOnly?: 'banana'
  chaotic?: boolean
  monkeyCalls?: boolean
  creeperEffects?: boolean
  masterVolume?: number
  pad?: boolean
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
  rhythm?: {
    steps: (number | null)[]
    stepMs: number
    volume: number
    decay: number
    waveform: OscillatorType
    filter?: BiquadFilterType
    filterFrequency?: number
    partials?: { ratio: number; level: number }[]
  }
  rain?: boolean
  notes?: {
    frequencies: (number | null)[]
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
    description: 'A deep oceanic sine drone with slow, rounded bass pulses.',
    masterVolume: 0.06,
    waveform: 'sine',
    filterFrequency: 560,
    chordInterval: 6800,
    chordVolume: 0.12,
    rhythm: {
      steps: [65.41, null, null, 73.42, null, null, 55, null],
      stepMs: 720,
      volume: 0.055,
      decay: 0.62,
      waveform: 'sine',
    },
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
    description: 'A sparse, airy highland soundscape built from soft wind and long, open tones.',
    masterVolume: 0.055,
    pad: false,
    waveform: 'triangle',
    filterFrequency: 390,
    chordInterval: 8200,
    chordVolume: 0.1,
    rhythm: {
      steps: [null, 349.23, null, null, null, null, 523.25, null],
      stepMs: 960,
      volume: 0.024,
      decay: 1.05,
      waveform: 'triangle',
      filter: 'lowpass',
      filterFrequency: 1500,
    },
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
    description: 'Muted, woody plucks make a gentle syncopated melody over a faint forest ambience.',
    masterVolume: 0.055,
    pad: false,
    waveform: 'triangle',
    filterFrequency: 1100,
    chordInterval: 5200,
    chordVolume: 0.09,
    rhythm: {
      steps: [196, null, null, 293.66, null, 220, null, 329.63],
      stepMs: 360,
      volume: 0.04,
      decay: 0.17,
      waveform: 'square',
      filter: 'lowpass',
      filterFrequency: 720,
    },
    texture: { filter: 'bandpass', frequency: 850, volume: 0.018, pulse: 0.012 },
    notes: {
      frequencies: [392, 493.88, 587.33, 493.88, 440, 587.33, 659.25, 587.33],
      waveform: 'triangle',
      volume: 0.11,
      attack: 0.008,
      decay: 0.24,
      interval: 720,
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
    description: 'A soft, chord-free rain texture with irregular glassy droplets.',
    masterVolume: 0.06,
    pad: false,
    waveform: 'sine',
    filterFrequency: 760,
    chordInterval: 9000,
    chordVolume: 0.055,
    rhythm: {
      steps: [null, null, 659.25, null, null, null, 880, null, null, 587.33, null, null],
      stepMs: 420,
      volume: 0.035,
      decay: 0.11,
      waveform: 'triangle',
      filter: 'bandpass',
      filterFrequency: 1250,
      partials: [{ ratio: 2, level: 0.12 }],
    },
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
    description: 'A chord-free constellation of bright, slowly ringing bell tones.',
    masterVolume: 0.05,
    pad: false,
    waveform: 'sine',
    filterFrequency: 1800,
    chordInterval: 6200,
    chordVolume: 0.08,
    rhythm: {
      steps: [null, 783.99, null, null, 1174.66, null, 987.77, null, null, 880],
      stepMs: 680,
      volume: 0.027,
      decay: 1.15,
      waveform: 'sine',
      partials: [
        { ratio: 2.01, level: 0.28 },
        { ratio: 3.92, level: 0.08 },
      ],
    },
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
  {
    name: 'Opium #1',
    description: 'An original, dark trap instrumental with cavernous sub pulses, sparse minor-key synth stabs, and a slow, heavy pocket.',
    masterVolume: 0.095,
    pad: false,
    waveform: 'sawtooth',
    filterFrequency: 680,
    chordInterval: 6400,
    chordVolume: 0.08,
    texture: { filter: 'lowpass', frequency: 190, volume: 0.018, pulse: 0.012 },
    rhythm: {
      steps: [55, null, null, 55, null, 65.41, null, null, 49, null, 55, null, null, 73.42, null, null],
      stepMs: 300,
      volume: 0.09,
      decay: 0.2,
      waveform: 'sine',
    },
    notes: {
      frequencies: [146.83, 164.81, 174.61, 164.81, 220, 196, 146.83, 164.81],
      waveform: 'sawtooth',
      volume: 0.045,
      attack: 0.008,
      decay: 0.32,
      interval: 600,
    },
    chords: [
      [73.42, 110, 146.83],
      [65.41, 98, 130.81],
      [82.41, 123.47, 164.81],
      [55, 82.41, 110],
    ],
  },
  {
    name: 'Opium #2',
    description: 'An original, tense trap instrumental built from clipped low synths, rolling sub accents, and a shifting half-time groove.',
    masterVolume: 0.09,
    pad: false,
    waveform: 'sawtooth',
    filterFrequency: 760,
    chordInterval: 4800,
    chordVolume: 0.075,
    texture: { filter: 'lowpass', frequency: 150, volume: 0.016, pulse: 0.009 },
    rhythm: {
      steps: [43.65, null, 65.41, null, null, 49, null, 73.42, 43.65, null, null, 58.27, null, 82.41, null, 49],
      stepMs: 260,
      volume: 0.1,
      decay: 0.18,
      waveform: 'sine',
    },
    notes: {
      frequencies: [130.81, null, 155.56, 146.83, null, 174.61, 155.56, null, 123.47, 146.83, null, 164.81],
      waveform: 'triangle',
      volume: 0.05,
      attack: 0.006,
      decay: 0.28,
      interval: 420,
    },
    chords: [
      [43.65, 87.31, 130.81, 174.61],
      [49, 98, 146.83, 196],
      [58.27, 116.54, 174.61, 233.08],
      [43.65, 87.31, 130.81, 155.56],
    ],
  },
  {
    name: 'Tonka',
    description: 'An original, high-energy trap instrumental with a lower-register syncopated bass groove, sliding synth accents, and a longer evolving phrase.',
    masterVolume: 0.09,
    pad: false,
    waveform: 'triangle',
    filterFrequency: 1100,
    chordInterval: 3200,
    chordVolume: 0.07,
    rhythm: {
      steps: [
        49, null, 73.42, null, 55, null, 82.41, null, 65.41, null, null, 98, null, 55, null, 73.42,
        49, null, null, 65.41, null, 82.41, null, 55, null, 73.42, null, null, 49, 98, null, 65.41,
        55, null, 82.41, null, 49, null, 73.42, 110, null, 65.41, null, 55, null, 98, null, 73.42,
        49, null, 65.41, null, null, 82.41, 55, null, 73.42, null, 49, null, 110, null, 65.41, null,
      ],
      stepMs: 180,
      volume: 0.11,
      decay: 0.2,
      waveform: 'sine',
    },
    notes: {
      frequencies: [
        196, null, 220, 196, 164.81, null, 196, 246.94, 220, 196, null, 164.81, 146.83, null, 164.81, 196,
        220, null, 261.63, 220, 196, null, 174.61, 220, 164.81, 146.83, null, 164.81, 196, 220, null, 196,
        174.61, null, 146.83, 164.81, 196, null, 220, 164.81,
      ],
      waveform: 'triangle',
      volume: 0.06,
      attack: 0.009,
      decay: 0.2,
      interval: 240,
    },
    chords: [
      [49, 98, 146.83, 196],
      [55, 110, 164.81, 220],
      [65.41, 130.81, 196, 246.94],
      [49, 98, 146.83, 174.61],
      [73.42, 146.83, 220, 293.66],
      [55, 110, 164.81, 196],
    ],
  },
  {
    name: 'Cavern Memo',
    description: 'An original nostalgic game-ambient piece with soft, rounded notes and a slow, spacious pulse.',
    masterVolume: 0.048,
    waveform: 'triangle',
    filterFrequency: 1500,
    chordInterval: 8000,
    chordVolume: 0.065,
    rhythm: {
      steps: [65.41, null, null, null, 98, null, null, null, 73.42, null, null, 110, null, null, null, 82.41, null, null, null, 123.47, null, null, null, 73.42, null, null, null, 98, null, null, null, 65.41],
      stepMs: 1100,
      volume: 0.024,
      decay: 0.8,
      waveform: 'sine',
      filter: 'lowpass',
      filterFrequency: 380,
    },
    notes: {
      frequencies: [392, 329.63, null, 293.66, 261.63, null, 329.63, 392, null, 440, 392, null, 329.63, 293.66, null, 261.63, 293.66, null, 329.63, 392, null, 329.63, 293.66, 261.63],
      waveform: 'triangle',
      volume: 0.045,
      attack: 0.035,
      decay: 1.2,
      interval: 1850,
    },
    chords: [
      [130.81, 196, 261.63, 329.63],
      [110, 164.81, 220, 293.66],
      [123.47, 185, 246.94, 329.63],
      [98, 146.83, 196, 261.63],
      [130.81, 196, 246.94, 329.63],
      [110, 164.81, 220, 261.63],
    ],
  },
  {
    name: 'Spawn at Dusk',
    description: 'A gentle, original twilight soundscape with warm low chords, a drifting melody, and occasional bell-like notes.',
    masterVolume: 0.046,
    waveform: 'sine',
    filterFrequency: 1250,
    chordInterval: 9000,
    chordVolume: 0.07,
    rhythm: {
      steps: [73.42, null, null, null, null, 110, null, null, null, 82.41, null, null, null, null, 123.47, null, 65.41, null, null, null, 98, null, null, null, 73.42, null, null, 110, null, null, null, 82.41, null, null, null, 123.47, null, null, null, 65.41],
      stepMs: 1050,
      volume: 0.022,
      decay: 0.95,
      waveform: 'sine',
    },
    notes: {
      frequencies: [523.25, null, 440, 392, null, 329.63, 392, null, 440, 523.25, null, 587.33, 523.25, null, 440, 392, null, 329.63, 349.23, null, 392, 440, null, 523.25, 493.88, null, 392, 349.23, null, 329.63],
      waveform: 'sine',
      volume: 0.05,
      attack: 0.08,
      decay: 1.55,
      interval: 1700,
      partials: [{ ratio: 2, level: 0.12 }],
    },
    chords: [
      [146.83, 220, 293.66, 369.99],
      [130.81, 196, 261.63, 329.63],
      [164.81, 246.94, 329.63, 392],
      [110, 164.81, 220, 293.66],
      [146.83, 220, 293.66, 349.23],
    ],
  },
  {
    name: 'Mossy Steps',
    description: 'An original, quietly curious pixel-world tune with woody plucks, rests, and a lightly loping low line.',
    masterVolume: 0.05,
    waveform: 'triangle',
    filterFrequency: 960,
    chordInterval: 7200,
    chordVolume: 0.06,
    rhythm: {
      steps: [55, null, null, 82.41, null, null, 65.41, null, null, null, 98, null, 73.42, null, null, 110, null, null, 55, null, null, 82.41, null, 65.41, null, null, null, 98, null, 73.42, null, null, 110, null, 55, null, null, 82.41, null, null],
      stepMs: 900,
      volume: 0.026,
      decay: 0.65,
      waveform: 'triangle',
      filter: 'lowpass',
      filterFrequency: 420,
    },
    notes: {
      frequencies: [293.66, null, 349.23, 392, null, 329.63, 261.63, null, 293.66, 440, null, 392, 349.23, null, 261.63, 293.66, null, 329.63, 392, null, 349.23, 293.66, null, 261.63],
      waveform: 'triangle',
      volume: 0.055,
      attack: 0.012,
      decay: 0.48,
      interval: 1950,
    },
    chords: [
      [110, 164.81, 220, 261.63],
      [130.81, 196, 261.63, 329.63],
      [146.83, 220, 293.66, 349.23],
      [98, 146.83, 196, 246.94],
      [110, 164.81, 220, 293.66],
      [123.47, 185, 246.94, 293.66],
    ],
  },
  {
    name: 'Cloudsave',
    description: 'An original floating, weightless game-world soundscape with slow, bell-soft phrases and long gaps.',
    masterVolume: 0.044,
    waveform: 'sine',
    filterFrequency: 2200,
    chordInterval: 10000,
    chordVolume: 0.055,
    rhythm: {
      steps: [49, null, null, null, null, null, 73.42, null, null, null, null, 55, null, null, null, null, null, 82.41, null, null, null, null, 49, null, null, null, 73.42, null, null, null, null, null, 55, null, null, null, null, 82.41],
      stepMs: 1200,
      volume: 0.022,
      decay: 1.1,
      waveform: 'sine',
      filter: 'lowpass',
      filterFrequency: 240,
    },
    notes: {
      frequencies: [783.99, null, 659.25, null, 587.33, 523.25, null, 659.25, 880, null, 783.99, null, 659.25, 587.33, null, 523.25, 587.33, null, 659.25, 783.99, null, 880, 783.99, null, 659.25],
      waveform: 'sine',
      volume: 0.047,
      attack: 0.12,
      decay: 2.2,
      interval: 2100,
      partials: [{ ratio: 2.01, level: 0.2 }, { ratio: 3.92, level: 0.04 }],
    },
    chords: [
      [164.81, 246.94, 329.63, 392],
      [146.83, 220, 293.66, 369.99],
      [130.81, 196, 261.63, 329.63],
      [174.61, 261.63, 349.23, 440],
      [164.81, 246.94, 329.63, 392],
    ],
  },
  {
    name: 'Last Light',
    description: 'An original wistful, slow-building soundscape with mellow synth bells, a low heartbeat, and a long changing phrase.',
    masterVolume: 0.045,
    waveform: 'triangle',
    filterFrequency: 1800,
    chordInterval: 8800,
    chordVolume: 0.058,
    rhythm: {
      steps: [58.27, null, null, null, 87.31, null, null, null, null, 65.41, null, null, null, 98, null, null, 58.27, null, null, null, 87.31, null, 65.41, null, null, null, 98, null, null, null, 73.42, null, 58.27, null, null, null, 87.31, null, null, 65.41],
      stepMs: 1050,
      volume: 0.024,
      decay: 0.9,
      waveform: 'sine',
      filter: 'lowpass',
      filterFrequency: 320,
    },
    notes: {
      frequencies: [349.23, 392, null, 523.25, 440, null, 392, 329.63, null, 293.66, 349.23, null, 392, 440, null, 523.25, 493.88, null, 440, 392, null, 349.23, 329.63, null, 293.66, 329.63],
      waveform: 'sine',
      volume: 0.048,
      attack: 0.055,
      decay: 1.6,
      interval: 1950,
      partials: [{ ratio: 2, level: 0.1 }],
    },
    chords: [
      [116.54, 174.61, 233.08, 293.66],
      [130.81, 196, 261.63, 329.63],
      [146.83, 220, 293.66, 349.23],
      [110, 164.81, 220, 277.18],
      [123.47, 185, 246.94, 311.13],
      [116.54, 174.61, 233.08, 293.66],
    ],
  },
  {
    name: 'Glasshouse',
    description: 'A clear, delicate original soundscape of high glassy notes over widely spaced, warm chords.',
    masterVolume: 0.05,
    waveform: 'sine',
    filterFrequency: 3200,
    chordInterval: 7600,
    chordVolume: 0.075,
    pad: false,
    rhythm: {
      steps: [null, 523.25, null, null, 659.25, null, null, null, 587.33, null, null, 783.99],
      stepMs: 530,
      volume: 0.025,
      decay: 1.4,
      waveform: 'sine',
      partials: [{ ratio: 2.01, level: 0.32 }, { ratio: 3.92, level: 0.09 }],
    },
    notes: {
      frequencies: [1046.5, 783.99, 987.77, 1318.51, 880, 1174.66, 987.77],
      waveform: 'sine',
      volume: 0.08,
      attack: 0.015,
      decay: 1.8,
      interval: 1850,
      partials: [{ ratio: 2.01, level: 0.35 }, { ratio: 3.92, level: 0.1 }],
    },
    chords: [
      [130.81, 196, 261.63, 392],
      [146.83, 220, 293.66, 440],
      [110, 164.81, 246.94, 369.99],
      [123.47, 185, 246.94, 369.99],
    ],
  },
  {
    name: 'Dustlight',
    description: 'A mellow, tape-warm original groove with muted organ tones and a lazy, lightly swung pulse.',
    masterVolume: 0.052,
    waveform: 'triangle',
    filterFrequency: 920,
    chordInterval: 5800,
    chordVolume: 0.065,
    texture: { filter: 'lowpass', frequency: 680, volume: 0.012, pulse: 0.01 },
    rhythm: {
      steps: [130.81, null, null, 196, null, 146.83, null, null, 174.61, null, 220, null],
      stepMs: 410,
      volume: 0.036,
      decay: 0.3,
      waveform: 'triangle',
      filter: 'lowpass',
      filterFrequency: 540,
    },
    notes: {
      frequencies: [261.63, null, 329.63, 293.66, null, 392, 329.63, null, 293.66, 349.23],
      waveform: 'triangle',
      volume: 0.07,
      attack: 0.035,
      decay: 0.48,
      interval: 615,
    },
    chords: [
      [130.81, 164.81, 196, 246.94],
      [110, 146.83, 174.61, 220],
      [146.83, 174.61, 220, 261.63],
      [123.47, 155.56, 185, 233.08],
    ],
  },
  {
    name: 'Blue Hour',
    description: 'A calm, open-ended original night piece with low rounded tones and occasional distant, breathy notes.',
    masterVolume: 0.048,
    pad: false,
    waveform: 'sine',
    filterFrequency: 1050,
    chordInterval: 9600,
    chordVolume: 0.06,
    texture: { filter: 'lowpass', frequency: 360, volume: 0.014, pulse: 0.012 },
    rhythm: {
      steps: [73.42, null, null, null, null, 82.41, null, null, null, null, 65.41, null],
      stepMs: 820,
      volume: 0.042,
      decay: 1.1,
      waveform: 'sine',
    },
    notes: {
      frequencies: [220, null, 293.66, null, 261.63, 196, null, 329.63],
      waveform: 'triangle',
      volume: 0.04,
      attack: 0.2,
      decay: 2.4,
      interval: 2600,
    },
    chords: [
      [110, 164.81, 220, 293.66],
      [98, 146.83, 196, 261.63],
      [123.47, 185, 246.94, 329.63],
      [87.31, 130.81, 174.61, 261.63],
    ],
  },
  {
    name: 'Late Night Drive',
    description: 'An original coastal night-drive groove: steady low kick, rolling bass, a glassy lead, and a soft ocean-wind bed.',
    secret: true,
    rareChance: 1 / 5000,
    masterVolume: 0.075,
    pad: false,
    waveform: 'triangle',
    filterFrequency: 1800,
    chordInterval: 6400,
    chordVolume: 0.065,
    texture: { filter: 'bandpass', frequency: 260, volume: 0.022, pulse: 0.008 },
    rhythm: {
      steps: [55, null, 55, 82.41, null, 65.41, null, 55, 73.42, null, 55, null, 98, null, 65.41, 73.42],
      stepMs: 370,
      volume: 0.068,
      decay: 0.24,
      waveform: 'sine',
      filter: 'lowpass',
      filterFrequency: 240,
    },
    notes: {
      frequencies: [440, null, 523.25, 587.33, null, 493.88, 392, null, 440, 659.25, null, 587.33, 523.25, null, 493.88, 392],
      waveform: 'sine',
      volume: 0.052,
      attack: 0.045,
      decay: 0.9,
      interval: 740,
      partials: [{ ratio: 2, level: 0.12 }],
    },
    chords: [
      [110, 164.81, 220, 261.63],
      [98, 146.83, 196, 246.94],
      [123.47, 185, 220, 293.66],
      [87.31, 130.81, 174.61, 220],
      [110, 164.81, 196, 261.63],
      [98, 146.83, 220, 293.66],
    ],
  },
  {
    name: 'Paper Lanterns',
    description: 'A gentle original music-box waltz with rounded plucks, a lilting triple pulse, and soft low notes.',
    masterVolume: 0.05,
    waveform: 'triangle',
    filterFrequency: 2400,
    chordInterval: 5400,
    chordVolume: 0.055,
    rhythm: {
      steps: [196, null, 392, null, 293.66, null, 392, null, 174.61, null, 349.23, null],
      stepMs: 500,
      volume: 0.022,
      decay: 0.3,
      waveform: 'sine',
      partials: [{ ratio: 2, level: 0.18 }],
    },
    notes: {
      frequencies: [523.25, 659.25, 783.99, 659.25, 587.33, 392, 493.88, 587.33, 659.25],
      waveform: 'sine',
      volume: 0.075,
      attack: 0.025,
      decay: 0.82,
      interval: 500,
      partials: [{ ratio: 2, level: 0.2 }, { ratio: 3, level: 0.06 }],
    },
    chords: [
      [130.81, 196, 261.63],
      [146.83, 220, 293.66],
      [164.81, 246.94, 329.63],
      [110, 164.81, 220],
    ],
  },
  {
    name: 'Soft Focus',
    description: 'A slow, warm original synth meditation with hazy sustained chords and a sparse, low heartbeat.',
    masterVolume: 0.047,
    waveform: 'triangle',
    filterFrequency: 520,
    chordInterval: 11000,
    chordVolume: 0.105,
    rhythm: {
      steps: [55, null, null, null, 55, null, null, null],
      stepMs: 1100,
      volume: 0.032,
      decay: 0.9,
      waveform: 'sine',
      filter: 'lowpass',
      filterFrequency: 190,
    },
    texture: { filter: 'lowpass', frequency: 240, volume: 0.025, pulse: 0.018 },
    chords: [
      [130.81, 196, 261.63, 329.63],
      [110, 164.81, 220, 293.66],
      [146.83, 220, 293.66, 369.99],
      [123.47, 185, 246.94, 311.13],
    ],
  },
  {
    name: 'Hidden Signal',
    description: 'A rare, original little melody drifting through a soft, dreamlike synth.',
    secret: true,
    waveform: 'triangle',
    filterFrequency: 1450,
    chordInterval: 7600,
    chordVolume: 0.055,
    notes: {
      frequencies: [293.66, 369.99, 440, 554.37, 493.88, 369.99, 329.63, 440],
      waveform: 'sine',
      volume: 0.075,
      attack: 0.12,
      decay: 3.6,
      interval: 2600,
      partials: [
        { ratio: 2, level: 0.12 },
      ],
    },
    chords: [
      [146.83, 220, 293.66],
      [130.81, 196, 246.94],
      [164.81, 220, 329.63],
      [110, 164.81, 246.94],
    ],
  },
  {
    name: 'Banana Jungle',
    description: 'A chaotic original jungle jam with chattery, cartoonish synth-monkey calls.',
    modeOnly: 'banana',
    chaotic: true,
    monkeyCalls: true,
    waveform: 'square',
    filterFrequency: 3200,
    chordInterval: 240,
    chordVolume: 0.045,
    notes: {
      frequencies: [392, 659.25, 523.25, 783.99, 440, 698.46, 587.33, 880, 493.88, 783.99],
      waveform: 'square',
      volume: 0.14,
      attack: 0.006,
      decay: 0.19,
      interval: 155,
    },
    chords: [
      [98, 196, 293.66, 392],
      [110, 220, 329.63, 440],
      [87.31, 174.61, 261.63, 523.25],
      [123.47, 246.94, 369.99, 493.88],
    ],
  },
  {
    name: 'Creeper Rave',
    description: 'An original blocky synth track with hissy risers and rumbling pixel-blast effects.',
    secret: true,
    chaotic: true,
    creeperEffects: true,
    waveform: 'square',
    filterFrequency: 4200,
    chordInterval: 210,
    chordVolume: 0.045,
    notes: {
      frequencies: [82.41, 164.81, 246.94, 329.63, 392, 311.13, 493.88, 196],
      waveform: 'square',
      volume: 0.13,
      attack: 0.004,
      decay: 0.16,
      interval: 135,
    },
    chords: [
      [82.41, 164.81, 246.94, 329.63],
      [73.42, 146.83, 220, 293.66],
      [87.31, 174.61, 261.63, 349.23],
      [65.41, 130.81, 196, 261.63],
    ],
  },
]

const selectableAmbientTracks = ambientTracks.filter(track => !track.secret && !track.modeOnly)
const tracklistTracks = ambientTracks
const trackDurations: Record<string, number> = {
  Tides: 72,
  'Mountain Wind': 84,
  Forest: 60,
  Rain: 90,
  Starlight: 75,
  'Opium #1': 64,
  'Opium #2': 78,
  Tonka: 96,
  'Cavern Memo': 48,
  'Spawn at Dusk': 72,
  'Mossy Steps': 54,
  Cloudsave: 88,
  'Last Light': 104,
  Glasshouse: 60,
  Dustlight: 42,
  'Blue Hour': 78,
  'Late Night Drive': 86,
  'Paper Lanterns': 66,
  'Soft Focus': 110,
  'Hidden Signal': 56,
  'Banana Jungle': 64,
  'Creeper Rave': 72,
}
const rhythmVoices: Record<string, 'sub' | 'kick' | 'pluck' | 'bell' | 'digital' | 'drum'> = {
  Tides: 'sub',
  'Mountain Wind': 'bell',
  Forest: 'pluck',
  Rain: 'bell',
  Starlight: 'bell',
  'Opium #1': 'kick',
  'Opium #2': 'kick',
  Tonka: 'sub',
  'Cavern Memo': 'pluck',
  'Spawn at Dusk': 'bell',
  'Mossy Steps': 'pluck',
  Cloudsave: 'bell',
  'Last Light': 'bell',
  Glasshouse: 'bell',
  Dustlight: 'pluck',
  'Blue Hour': 'sub',
  'Late Night Drive': 'kick',
  'Paper Lanterns': 'bell',
  'Soft Focus': 'sub',
  'Hidden Signal': 'digital',
  'Banana Jungle': 'digital',
  'Creeper Rave': 'kick',
}

function getTrackDuration(track: AmbientTrack) {
  return trackDurations[track.name] ?? 60
}

function formatTrackTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

function setAmbientTrackEffect(trackName?: string) {
  const root = document.documentElement
  root.classList.toggle('lumen-track-paper-lanterns', trackName === 'Paper Lanterns')
  root.classList.toggle('lumen-music-animations-off', trackName === 'Paper Lanterns' && !musicAnimationsEnabled.value)
}

function updateMusicAnimationPreference() {
  const isPlaying = activeTrack?.name === 'Paper Lanterns'
  document.documentElement.classList.toggle(
    'lumen-music-animations-off',
    isPlaying && !musicAnimationsEnabled.value,
  )
}

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
  if (question.toLowerCase() === '#1 tracklist') {
    answers.value.push({
      question,
      results: [],
      reply: 'Secret tracklist unlocked. Choose a soundtrack to start playing:',
      tracklist: true,
    })
    query.value = ''
    searching.value = false
    await nextTick()
    conversation.value?.scrollTo({
      top: conversation.value.scrollHeight,
      behavior: 'smooth',
    })
    return
  }

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
  const responseElement = conversation.value?.querySelectorAll<HTMLElement>('.assistant-response').item(answers.value.length - 1)
  if (!conversation.value || !responseElement) return

  const responseTop = responseElement.getBoundingClientRect().top - conversation.value.getBoundingClientRect().top
  conversation.value.scrollTo({
    top: conversation.value.scrollTop + responseTop - 8,
    behavior: 'smooth',
  })
}

async function playTrackFromTracklist(trackName: string) {
  selectedMusicTrack.value = trackName
  if (musicStarting) return

  musicStarting = true
  try {
    const AudioContextConstructor = getAudioContextConstructor()
    if (!AudioContextConstructor) throw new Error('Web Audio is not supported by this browser.')

    audioContext ??= new AudioContextConstructor()
    await audioContext.resume()
    if (ambientMusic.value) stopAmbientMusic(0.12)
    startAmbientMusic(trackName, 0)
    ambientMusic.value = true
  } catch (error) {
    console.error('Unable to play soundtrack from the tracklist:', error)
    ambientMusic.value = false
    activeMusicTrack.value = ''
  } finally {
    musicStarting = false
  }
}

function seekTrack(trackName: string, positionSeconds: number) {
  if (!ambientMusic.value || !audioContext || activeTrack?.name !== trackName || musicStarting) return
  const duration = getTrackDuration(activeTrack)
  const position = Math.min(duration - 1, Math.max(0, Math.floor(positionSeconds)))
  stopAmbientMusic(0.04)
  try {
    startAmbientMusic(trackName, position)
  } catch (error) {
    console.error('Unable to seek soundtrack:', error)
    ambientMusic.value = false
    activeMusicTrack.value = ''
  }
}

function focusInput() {
  open.value = true
  requestAnimationFrame(() => input.value?.focus())
}

function useSuggestedQuestion(question: string) {
  assistantView.value = 'chat'
  query.value = question
  input.value?.focus()
}

function openBugReport() {
  assistantView.value = 'bug-report'
  bugReportError.value = ''
  bugReportSent.value = false
}

function showBugReport() {
  openBugReport()
  open.value = true
}

function getWorkerEndpoint(path: string) {
  if (!assistantEndpoint) return ''

  const loginEndpoint = path === '/auth/login' ? import.meta.env.VITE_DOCS_ASSISTANT_LOGIN_ENDPOINT : undefined
  const endpoint = new URL(loginEndpoint || assistantEndpoint, window.location.origin)
  if (loginEndpoint) {
    endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + path
    endpoint.search = ''
    return endpoint.toString()
  }
  endpoint.pathname = endpoint.pathname.replace(/\/chat\/?$/, '').replace(/\/$/, '') + path
  endpoint.search = ''
  return endpoint.toString()
}

function publishDiscordUser(user: DiscordUser | null) {
  window.dispatchEvent(new CustomEvent('lumen-discord-user', { detail: user }))
}

async function initializeDiscordLogin() {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const callbackToken = hash.get('discord_token')
  const callbackStatus = hash.get('discord_login')
  if (callbackToken || callbackStatus) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }

  if (callbackToken) {
    try {
      storeDiscordSession(callbackToken)
    } catch (error) {
      console.error('Unable to store the temporary Discord sign-in session:', error)
    }
  }
  if (callbackStatus) {
    discordAuthNotice.value = callbackStatus === 'unavailable'
      ? 'Discord sign-in is not configured yet.'
      : callbackStatus === 'cancelled'
        ? 'Discord sign-in was cancelled.'
        : 'Discord sign-in could not be completed. Please try again.'
  }

  let token = callbackToken ?? ''
  if (!token) {
    try {
      token = getDiscordSession()
    } catch (error) {
      console.error('Unable to read the temporary Discord sign-in session:', error)
    }
  }
  if (!token || !assistantEndpoint) return

  try {
    const response = await fetch(getWorkerEndpoint('/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await response.json() as { user?: DiscordUser; sessionToken?: string; error?: string }
    if (!response.ok || !result.user) {
      try {
        clearDiscordSession()
      } catch (error) {
        console.error('Unable to clear the expired Discord sign-in session:', error)
      }
      publishDiscordUser(null)
      if (callbackToken) discordAuthNotice.value = result.error ?? 'Discord sign-in expired. Please sign in again.'
      return
    }

    if (result.sessionToken) storeDiscordSession(result.sessionToken)
    discordUser.value = result.user
    publishDiscordUser(result.user)
  } catch (error) {
    console.error('Unable to verify Discord sign-in:', error)
    if (callbackToken) discordAuthNotice.value = 'Could not verify Discord sign-in. Please try again.'
  }
}

async function startDiscordLogin() {
  const endpoint = getWorkerEndpoint('/auth/login')
  if (!endpoint) {
    discordAuthNotice.value = 'Discord sign-in is not configured yet.'
    return
  }
  loginReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  loginModalOpen.value = true
  await nextTick()
  loginDialog.value?.querySelector<HTMLButtonElement>('.discord-login-button')?.focus()
}

function closeDiscordLogin() {
  loginModalOpen.value = false
  loginReturnFocus?.focus()
}

function handleLoginDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    closeDiscordLogin()
    return
  }
  if (event.key !== 'Tab') return
  const buttons = loginDialog.value?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
  if (!buttons?.length) return
  const first = buttons[0]
  const last = buttons[buttons.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function confirmDiscordLogin() {
  const endpoint = getWorkerEndpoint('/auth/login')
  if (!endpoint) {
    discordAuthNotice.value = 'Discord sign-in is not configured yet.'
    return
  }
  loginModalOpen.value = false
  window.location.assign(endpoint)
}

function signOutDiscord() {
  accountMenuOpen.value = false
  discordUser.value = null
  try {
    clearDiscordSession()
  } catch (error) {
    console.error('Unable to clear the Discord sign-in session:', error)
  }
  publishDiscordUser(null)
}

function handleAccountMenuPointerDown(event: PointerEvent) {
  const target = event.target
  if (target instanceof Element && !target.closest('.lumen-account-dropdown')) {
    accountMenuOpen.value = false
  }
}

function handleAccountMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') accountMenuOpen.value = false
}

function getBugReportEndpoint() {
  if (!assistantEndpoint) return ''

  const endpoint = new URL(assistantEndpoint, window.location.origin)
  endpoint.pathname = endpoint.pathname.replace(/\/chat\/?$/, '') + '/community/tickets'
  endpoint.search = ''
  return endpoint.toString()
}

async function submitBugReport() {
  if (submittingBugReport.value) return
  if (!getDiscordSession()) {
    bugReportError.value = 'Connect your Discord account using Log in before submitting a website bug ticket.'
    return
  }
  const endpoint = getBugReportEndpoint()
  if (!endpoint) {
    bugReportError.value = 'Bug reports are temporarily unavailable. Please contact us on Discord.'
    return
  }

  submittingBugReport.value = true
  bugReportError.value = ''
  try {
    await communityRequest('/tickets', {
      method: 'POST', body: JSON.stringify({
        type: 'bug', title: `Bug report: ${bugReport.value.plugin}`.slice(0, 120),
        productId: bugReport.value.plugin, serverSoftware: bugReport.value.serverSoftware,
        minecraftVersion: bugReport.value.version,
        body: [bugReport.value.description, bugReport.value.consoleLog ? `Sanitized console excerpt:\n${bugReport.value.consoleLog}` : ''].filter(Boolean).join('\n\n').slice(0, 4000),
      }),
    })

    bugReportSent.value = true
  } catch (error) {
    bugReportError.value = error instanceof Error
      ? error.message
      : 'Could not deliver the report. Please try again later.'
  } finally {
    submittingBugReport.value = false
  }
}

function playClickSound(event: MouseEvent) {
  if (!clickSounds.value || !(event.target instanceof Element)) return
  if (!event.target.closest('a, button, [role="button"], summary')) return

  const AudioContextConstructor = getAudioContextConstructor()
  if (!AudioContextConstructor) return

  audioContext ??= new AudioContextConstructor()
  if (audioContext.state !== 'running') {
    void audioContext.resume().catch(error => {
      console.error('Unable to resume click sounds:', error)
    })
    return
  }
  const now = audioContext.currentTime
  for (const note of [
    { type: 'triangle' as OscillatorType, start: 440, end: 280, peak: 0.065, duration: 0.14 },
    { type: 'sine' as OscillatorType, start: 880, end: 560, peak: 0.018, duration: 0.1 },
  ]) {
    const tone = audioContext.createOscillator()
    const volume = audioContext.createGain()
    tone.type = note.type
    tone.frequency.setValueAtTime(note.start, now)
    tone.frequency.exponentialRampToValueAtTime(note.end, now + note.duration)
    volume.gain.setValueAtTime(0.0001, now)
    volume.gain.exponentialRampToValueAtTime(note.peak, now + 0.008)
    volume.gain.exponentialRampToValueAtTime(0.0001, now + note.duration)
    tone.connect(volume)
    volume.connect(audioContext.destination)
    tone.start(now)
    tone.stop(now + note.duration + 0.01)
  }
}

function toggleClickSounds() {
  clickSounds.value = !clickSounds.value
  try {
    localStorage.setItem('lumen-click-sounds', String(clickSounds.value))
  } catch {
    // Keep the setting for this page view when browser storage is unavailable.
  }
}

function updateMusicVolume() {
  document.documentElement.style.setProperty(
    '--lumen-motion-speed',
    String(Math.max(0.35, 2.5 - (musicVolume.value / 300) * 2.15)),
  )
  if (!audioContext || !musicOutput) return
  musicOutput.gain.setTargetAtTime(musicVolume.value / 100 * 3, audioContext.currentTime, 0.025)
}

function handleMusicTrackSelection() {
  if (!ambientMusic.value || !audioContext) return
  stopAmbientMusic(0.12)
  try {
    startAmbientMusic()
  } catch (error) {
    console.error('Unable to switch ambient music:', error)
    ambientMusic.value = false
    activeMusicTrack.value = ''
  }
}

function startAmbientMusic(forceTrackName?: string, startPositionSeconds = 0) {
  if (!audioContext || audioContext.state !== 'running') {
    throw new Error('The audio context is not running.')
  }

  const now = audioContext.currentTime
  const bananaTrackIndex = ambientTracks.findIndex(track => track.modeOnly === 'banana')
  const secretTrackIndex = ambientTracks.findIndex(track => track.secret)
  const isBananaMode = document.documentElement.classList.contains('lumen-banana')
  const forcedTrackIndex = forceTrackName
    ? ambientTracks.findIndex(track => track.name === forceTrackName)
    : -1
  const selectedTrackIndex = ambientTracks.findIndex(track =>
    track.name === selectedMusicTrack.value && !track.secret && !track.modeOnly,
  )
  const canPlayAmbientSecret = forcedTrackIndex < 0 && selectedTrackIndex < 0 &&
    !isBananaMode
  const rareTrackIndex = ambientTracks.findIndex(track => track.rareChance !== undefined)
  const playRareTrack = canPlayAmbientSecret && rareTrackIndex >= 0 &&
    Math.random() < (ambientTracks[rareTrackIndex]?.rareChance ?? 0)
  const playSecretTrack = !playRareTrack && canPlayAmbientSecret && Math.random() < 0.01
  const availableTracks = ambientTracks
    .map((_, index) => index)
    .filter(index => !ambientTracks[index].secret && !ambientTracks[index].modeOnly && index !== lastMusicTrack)
  const trackIndex = forcedTrackIndex >= 0
    ? forcedTrackIndex
    : isBananaMode
      ? bananaTrackIndex
      : playRareTrack
        ? rareTrackIndex
      : playSecretTrack
        ? secretTrackIndex
        : selectedTrackIndex >= 0
          ? selectedTrackIndex
          : availableTracks[Math.floor(Math.random() * availableTracks.length)]
  if (trackIndex < 0) throw new Error('No ambient music tracks are available.')
  activeTrack = ambientTracks[trackIndex]
  activeMusicTrack.value = activeTrack.name
  lastMusicTrack = trackIndex
  const duration = getTrackDuration(activeTrack)
  trackPositionOffsetSeconds = ((startPositionSeconds % duration) + duration) % duration
  trackPositionSeconds.value = trackPositionOffsetSeconds
  trackPositionStartedAt = performance.now()
  window.clearInterval(progressTimer)
  progressTimer = window.setInterval(() => {
    if (!activeTrack) return
    const elapsed = (performance.now() - trackPositionStartedAt) / 1000
    trackPositionSeconds.value = (trackPositionOffsetSeconds + elapsed) % getTrackDuration(activeTrack)
  }, 250)

  musicFilter = audioContext.createBiquadFilter()
  musicMaster = audioContext.createGain()
  musicOutput = audioContext.createGain()
  const musicLimiter = audioContext.createDynamicsCompressor()
  musicFilter.type = 'lowpass'
  musicFilter.frequency.setValueAtTime(activeTrack.filterFrequency, now)
  musicOutput.gain.setValueAtTime(musicVolume.value / 100 * 3, now)
  musicLimiter.threshold.setValueAtTime(-12, now)
  musicLimiter.knee.setValueAtTime(0, now)
  musicLimiter.ratio.setValueAtTime(20, now)
  musicLimiter.attack.setValueAtTime(0.003, now)
  musicLimiter.release.setValueAtTime(0.15, now)
  musicMaster.gain.setValueAtTime(0.0001, now)
  musicMaster.gain.linearRampToValueAtTime(
    activeTrack.masterVolume ?? (activeTrack.chaotic ? 0.12 : 0.022),
    now + (activeTrack.chaotic ? 0.12 : 2.5),
  )
  musicFilter.connect(musicMaster)
  musicMaster.connect(musicOutput)
  musicOutput.connect(musicLimiter)
  musicLimiter.connect(audioContext.destination)

  if (activeTrack.pad !== false) {
    musicChordIndex = Math.floor(trackPositionOffsetSeconds * 1000 / activeTrack.chordInterval) % activeTrack.chords.length
    for (const [index, frequency] of activeTrack.chords[musicChordIndex].entries()) {
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

  if (activeTrack.rhythm) {
    const rhythm = activeTrack.rhythm
    const beatStyle = rhythmVoices[activeTrack.name] ?? 'pluck'
    rhythmStepIndex = Math.floor(trackPositionOffsetSeconds * 1000 / rhythm.stepMs)
    const playRhythmStep = () => {
      if (!audioContext || !musicMaster || activeTrack?.rhythm !== rhythm) return

      const phraseNumber = Math.floor(rhythmStepIndex / rhythm.steps.length)
      const phraseStep = rhythmStepIndex % rhythm.steps.length
      const stepIndex = phraseNumber % 3 === 1 ? rhythm.steps.length - 1 - phraseStep : phraseStep
      const phraseTranspose = [1, 0.5, 1.25, 1][phraseNumber % 4]
      const frequency = rhythm.steps[stepIndex]
      rhythmStepIndex += 1
      if (frequency === null) return

      const beatAt = audioContext.currentTime
      const beatFilter = rhythm.filter || beatStyle === 'digital' ? audioContext.createBiquadFilter() : undefined
      if (beatFilter) {
        beatFilter.type = rhythm.filter ?? 'lowpass'
        beatFilter.frequency.setValueAtTime(
          rhythm.filterFrequency ?? (beatStyle === 'digital' ? 1700 : 1400),
          beatAt,
        )
        beatFilter.connect(musicMaster)
      }

      const stylePartials = beatStyle === 'bell'
        ? [{ ratio: 2.01, level: 0.24 }, { ratio: 3.92, level: 0.06 }]
        : []
      const partials = [{ ratio: 1, level: 1 }, ...stylePartials, ...(rhythm.partials ?? [])]
      for (const partial of partials) {
        const beat = audioContext.createOscillator()
        const beatVolume = audioContext.createGain()
        const partialFrequency = frequency * phraseTranspose * partial.ratio
        const attack = beatStyle === 'kick' || beatStyle === 'drum' || beatStyle === 'digital' ? 0.004 : 0.025
        const decay = beatStyle === 'bell'
          ? Math.min(2.4, Math.max(rhythm.decay, 1.1))
          : beatStyle === 'kick' || beatStyle === 'drum'
            ? Math.min(rhythm.decay, 0.24)
            : beatStyle === 'pluck'
              ? Math.min(rhythm.decay, 0.32)
              : rhythm.decay
        const volumeScale = beatStyle === 'kick' ? 1.35 : beatStyle === 'bell' ? 0.58 : 1
        beat.type = beatStyle === 'kick' || beatStyle === 'sub' || beatStyle === 'drum'
          ? 'sine'
          : beatStyle === 'digital'
            ? 'square'
            : beatStyle === 'bell'
              ? 'sine'
              : rhythm.waveform
        beat.frequency.setValueAtTime(partialFrequency, beatAt)
        if (beatStyle === 'kick' || beatStyle === 'drum') {
          beat.frequency.exponentialRampToValueAtTime(Math.max(28, partialFrequency * 0.52), beatAt + Math.min(0.16, decay))
        }
        beatVolume.gain.setValueAtTime(0.0001, beatAt)
        beatVolume.gain.linearRampToValueAtTime(rhythm.volume * partial.level * volumeScale, beatAt + attack)
        beatVolume.gain.exponentialRampToValueAtTime(0.0001, beatAt + decay)
        beat.connect(beatVolume)
        if (beatFilter) beatVolume.connect(beatFilter)
        else beatVolume.connect(musicMaster)
        beat.start(beatAt)
        beat.stop(beatAt + decay + 0.02)
        beat.onended = () => { musicSources = musicSources.filter(source => source !== beat) }
        musicSources.push(beat)
      }
    }

    playRhythmStep()
    rhythmTimer = window.setInterval(playRhythmStep, rhythm.stepMs)
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

  if (activeTrack.monkeyCalls) {
    const playMonkeyCalls = () => {
      if (!audioContext || !musicMaster || activeTrack?.name !== 'Banana Jungle') return

      const callAt = audioContext.currentTime
      for (let index = 0; index < 4; index += 1) {
        const call = audioContext.createOscillator()
        const callFilter = audioContext.createBiquadFilter()
        const callVolume = audioContext.createGain()
        const startAt = callAt + index * (0.035 + Math.random() * 0.055)
        const pitch = 380 + Math.random() * 850
        call.type = index === 1 ? 'sawtooth' : 'triangle'
        call.frequency.setValueAtTime(pitch, startAt)
        call.frequency.exponentialRampToValueAtTime(pitch * (1.2 + Math.random() * 0.5), startAt + 0.08)
        call.frequency.exponentialRampToValueAtTime(pitch * (0.58 + Math.random() * 0.18), startAt + 0.24)
        callFilter.type = 'bandpass'
        callFilter.frequency.setValueAtTime(1350 + Math.random() * 900, startAt)
        callFilter.Q.setValueAtTime(1.2, startAt)
        callVolume.gain.setValueAtTime(0.0001, startAt)
        callVolume.gain.linearRampToValueAtTime(0.2, startAt + 0.018)
        callVolume.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.27)
        call.connect(callFilter)
        callFilter.connect(callVolume)
        callVolume.connect(musicMaster)
        call.start(startAt)
        call.stop(startAt + 0.29)
      }

      monkeyTimer = window.setTimeout(playMonkeyCalls, 180 + Math.random() * 320)
    }

    monkeyTimer = window.setTimeout(playMonkeyCalls, 500)
  }

  if (activeTrack.creeperEffects) {
    const playCreeperEffect = () => {
      if (!audioContext || !musicMaster || activeTrack?.name !== 'Creeper Rave') return

      const effectAt = audioContext.currentTime
      const hissDuration = 0.42 + Math.random() * 0.42
      const noiseBuffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * hissDuration), audioContext.sampleRate)
      const samples = noiseBuffer.getChannelData(0)
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = (Math.random() * 2 - 1) * (0.7 + 0.3 * Math.sin(index / samples.length * Math.PI))
      }

      const hiss = audioContext.createBufferSource()
      const hissFilter = audioContext.createBiquadFilter()
      const hissVolume = audioContext.createGain()
      hiss.buffer = noiseBuffer
      hissFilter.type = 'bandpass'
      hissFilter.frequency.setValueAtTime(900, effectAt)
      hissFilter.frequency.exponentialRampToValueAtTime(4200 + Math.random() * 1600, effectAt + hissDuration)
      hissFilter.Q.setValueAtTime(0.7, effectAt)
      hissVolume.gain.setValueAtTime(0.0001, effectAt)
      hissVolume.gain.exponentialRampToValueAtTime(0.2, effectAt + hissDuration * 0.8)
      hissVolume.gain.exponentialRampToValueAtTime(0.0001, effectAt + hissDuration)
      hiss.connect(hissFilter)
      hissFilter.connect(hissVolume)
      hissVolume.connect(musicMaster)
      hiss.start(effectAt)
      hiss.stop(effectAt + hissDuration)
      hiss.onended = () => { musicSources = musicSources.filter(source => source !== hiss) }
      musicSources.push(hiss)

      const blastAt = effectAt + hissDuration + 0.03
      const blast = audioContext.createOscillator()
      const blastVolume = audioContext.createGain()
      blast.type = 'sawtooth'
      blast.frequency.setValueAtTime(110 + Math.random() * 45, blastAt)
      blast.frequency.exponentialRampToValueAtTime(28, blastAt + 0.48)
      blastVolume.gain.setValueAtTime(0.0001, blastAt)
      blastVolume.gain.exponentialRampToValueAtTime(0.48, blastAt + 0.018)
      blastVolume.gain.exponentialRampToValueAtTime(0.0001, blastAt + 0.58)
      blast.connect(blastVolume)
      blastVolume.connect(musicMaster)
      blast.start(blastAt)
      blast.stop(blastAt + 0.6)
      blast.onended = () => { musicSources = musicSources.filter(source => source !== blast) }
      musicSources.push(blast)

      minecraftTimer = window.setTimeout(playCreeperEffect, 1200 + Math.random() * 1900)
    }

    minecraftTimer = window.setTimeout(playCreeperEffect, 700)
  }

  if (activeTrack.pad !== false) {
    musicTimer = window.setInterval(() => {
      if (!audioContext || !activeTrack) return
      musicChordIndex = (musicChordIndex + 1) % activeTrack.chords.length
      const chord = activeTrack.chords[musicChordIndex]
      const changeAt = audioContext.currentTime
      musicOscillators.forEach((tone, index) => {
        tone.frequency.cancelScheduledValues(changeAt)
        tone.frequency.setTargetAtTime(chord[index], changeAt, activeTrack.chaotic ? 0.025 : 0.8)
      })
    }, activeTrack.chordInterval)
  }

  musicNoteIndex = activeTrack.notes
    ? Math.floor(trackPositionOffsetSeconds * 1000 / activeTrack.notes.interval)
    : 0
  if (activeTrack.notes) {
    const playTrackNote = () => {
      if (!audioContext || !activeTrack?.notes || !musicFilter) return
      const instrument = activeTrack.notes
      const changeAt = audioContext.currentTime
      const phraseNumber = Math.floor(musicNoteIndex / instrument.frequencies.length)
      const phraseStep = musicNoteIndex % instrument.frequencies.length
      const noteIndex = activeTrack.chaotic
        ? Math.floor(Math.random() * instrument.frequencies.length)
        : phraseNumber % 3 === 1
          ? instrument.frequencies.length - 1 - phraseStep
          : phraseStep
      const phraseTranspose = [1, 0.5, 1.25, 1][phraseNumber % 4]
      const frequency = instrument.frequencies[noteIndex]
      musicNoteIndex += 1
      if (frequency === null) return
      const partials = [{ ratio: 1, level: 1 }, ...(instrument.partials ?? [])]

      for (const partial of partials) {
        const note = audioContext.createOscillator()
        const noteVolume = audioContext.createGain()
        note.type = instrument.waveform
        note.frequency.setValueAtTime(frequency * phraseTranspose * partial.ratio, changeAt)
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

  setAmbientTrackEffect(activeTrack.name)
}

function handleThemeModeChange() {
  if (!ambientMusic.value || !audioContext) return
  stopAmbientMusic(0.12)
  try {
    startAmbientMusic()
    ambientMusic.value = true
  } catch (error) {
    console.error('Unable to switch theme music:', error)
    ambientMusic.value = false
    activeMusicTrack.value = ''
  }
}

function stopAmbientMusic(fadeDuration = 1.2) {
  setAmbientTrackEffect()
  if (!audioContext || !musicMaster) return

  window.clearInterval(musicTimer)
  musicTimer = undefined
  window.clearInterval(noteTimer)
  noteTimer = undefined
  window.clearInterval(progressTimer)
  progressTimer = undefined
  window.clearTimeout(rainTimer)
  rainTimer = undefined
  window.clearTimeout(monkeyTimer)
  monkeyTimer = undefined
  window.clearTimeout(minecraftTimer)
  minecraftTimer = undefined
  window.clearInterval(rhythmTimer)
  rhythmTimer = undefined
  const now = audioContext.currentTime
  musicMaster.gain.cancelScheduledValues(now)
  musicMaster.gain.setValueAtTime(musicMaster.gain.value, now)
  musicMaster.gain.linearRampToValueAtTime(0.0001, now + fadeDuration)
  for (const source of musicSources) source.stop(now + fadeDuration + 0.05)
  musicOscillators = []
  musicSources = []
  musicMaster = undefined
  musicOutput = undefined
  musicFilter = undefined
  activeTrack = undefined
  activeMusicTrack.value = ''
  trackPositionSeconds.value = 0
}

async function toggleAmbientMusic() {
  if (ambientMusic.value) {
    ambientMusic.value = false
    stopAmbientMusic()
    return
  }
  if (musicStarting) return

  musicStarting = true
  try {
    const AudioContextConstructor = getAudioContextConstructor()
    if (!AudioContextConstructor) throw new Error('Web Audio is not supported by this browser.')

    audioContext ??= new AudioContextConstructor()
    await audioContext.resume()
    startAmbientMusic()
    ambientMusic.value = true
  } catch (error) {
    console.error('Unable to start ambient music:', error)
    ambientMusic.value = false
    activeMusicTrack.value = ''
  } finally {
    musicStarting = false
  }
}

function resumeAmbientMusic() {
  if (!ambientMusic.value || !audioContext || audioContext.state === 'running') return

  void audioContext.resume().catch(error => {
    console.error('Unable to resume ambient music:', error)
  })
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
  updateMusicVolume()
  try {
    clickSounds.value = localStorage.getItem('lumen-click-sounds') !== 'false'
  } catch {
    clickSounds.value = true
  }
  document.addEventListener('click', playClickSound, true)
  document.addEventListener('pointerdown', resumeAmbientMusic, true)
  window.addEventListener('lumen-theme-mode-change', handleThemeModeChange)
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('pointerdown', handleAccountMenuPointerDown)
  window.addEventListener('keydown', handleAccountMenuKeydown)
  void initializeDiscordLogin()
})

onUnmounted(() => {
  document.removeEventListener('click', playClickSound, true)
  document.removeEventListener('pointerdown', resumeAmbientMusic, true)
  window.removeEventListener('lumen-theme-mode-change', handleThemeModeChange)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', handleAccountMenuPointerDown)
  window.removeEventListener('keydown', handleAccountMenuKeydown)
  window.clearInterval(musicTimer)
  window.clearInterval(noteTimer)
  window.clearInterval(progressTimer)
  window.clearTimeout(rainTimer)
  window.clearTimeout(monkeyTimer)
  window.clearInterval(rhythmTimer)
  window.clearTimeout(minecraftTimer)
  for (const source of musicSources) source.stop()
  void audioContext?.close()
  setAmbientTrackEffect()
})
</script>

<template>
  <div class="lumen-assistant">
    <ClientOnly>
      <Teleport to="#lumen-nav-auth">
        <button
          v-if="!discordUser"
          class="lumen-auth-button"
          type="button"
          :title="discordAuthNotice || 'Sign in with Discord'"
          @click="startDiscordLogin"
        >
          Log in
        </button>
        <div v-else class="lumen-account-dropdown">
          <button
            class="lumen-auth-button lumen-auth-user"
            type="button"
            :aria-expanded="accountMenuOpen"
            :aria-label="`${discordUser.globalName || discordUser.username} account menu`"
            aria-haspopup="menu"
            aria-controls="lumen-account-menu"
            title="Open account menu"
            @click="accountMenuOpen = !accountMenuOpen"
          >
            <img v-if="discordUser.avatarUrl" :src="discordUser.avatarUrl" alt="">
            <span>{{ discordUser.globalName || discordUser.username }}</span>
            <svg class="lumen-account-chevron" viewBox="0 0 12 12" aria-hidden="true">
              <path d="m2 4 4 4 4-4" />
            </svg>
          </button>
          <nav
            v-if="accountMenuOpen"
            id="lumen-account-menu"
            class="lumen-account-menu"
            aria-label="Account menu"
            role="menu"
          >
            <div class="lumen-account-menu-heading" role="presentation">
              <small>SIGNED IN WITH DISCORD</small>
              <strong>{{ discordUser.globalName || discordUser.username }}</strong>
            </div>
            <a href="/account/" role="menuitem" @click="accountMenuOpen = false">Dashboard</a>
            <a href="/account/licenses" role="menuitem" @click="accountMenuOpen = false">My licenses</a>
            <a href="/account/products" role="menuitem" @click="accountMenuOpen = false">Products purchased</a>
            <a href="/account/settings" role="menuitem" @click="accountMenuOpen = false">Account settings</a>
            <a v-if="discordUser.role" href="/admin/" role="menuitem" @click="accountMenuOpen = false">Staff Dashboard</a>
            <a href="/account/tickets" role="menuitem" @click="accountMenuOpen = false">My support tickets</a>
            <a href="/account/notifications" role="menuitem" @click="accountMenuOpen = false">Notifications &amp; preferences</a>
            <button type="button" role="menuitem" @click="signOutDiscord">Sign out</button>
          </nav>
        </div>
      </Teleport>
    </ClientOnly>
    <Transition name="discord-login-overlay">
      <div v-if="loginModalOpen" class="discord-login-overlay" @click="closeDiscordLogin" @keydown="handleLoginDialogKeydown">
        <div
          ref="loginDialog"
          class="discord-login-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="discord-login-title"
          aria-describedby="discord-login-description"
          @click.stop
        >
          <button
            class="discord-login-close"
            type="button"
            aria-label="Close login modal"
            @click="closeDiscordLogin"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
          <div class="discord-login-content">
            <span class="discord-login-eyebrow">YOUR LUMEN WORKSPACE</span>
            <svg class="discord-logo" viewBox="0 0 127 127" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0A105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36a77.7,77.7,0,0,0,6.89-11.11A68.42,68.42,0,0,1,28,85.22c.45-.24.9-.48,1.35-.72a77.21,77.21,0,0,0,66.36,0c.45.24.89.48,1.34.72a68.68,68.68,0,0,1-11.77,8.39,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60.55,31,53.88s5-11.81,11.43-11.81S53.89,47.16,53.07,53.88,48.11,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60.55,73.25,53.88s5-11.81,11.44-11.81S95.12,47.16,94.3,53.88,89.36,65.69,84.69,65.69Z"/>
            </svg>
            <h2 id="discord-login-title" class="discord-login-title">Log in with Discord</h2>
            <p id="discord-login-description" class="discord-login-description">Your plugins, licenses, and connected servers. All in one place, with your Discord account.</p>
            <button
              class="discord-login-button"
              type="button"
              @click="confirmDiscordLogin"
            >
              <svg class="discord-login-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.444.864-.607 1.25a18.27 18.27 0 0 0-5.487 0c-.163-.386-.395-.875-.607-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.042-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.294.075.075 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.075.075 0 0 1 .079.009c.12.098.246.198.373.295a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.076.076 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.030.077.077 0 0 0 .032-.057c.5-4.761-.838-8.898-3.549-12.56a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-.965-2.157-2.156 0-1.193.93-2.157 2.157-2.157 1.226 0 2.157.964 2.157 2.157 0 1.19-.93 2.155-2.157 2.155zm7.975 0c-1.183 0-2.157-.965-2.157-2.156 0-1.193.93-2.157 2.157-2.157 1.226 0 2.157.964 2.157 2.157 0 1.19-.931 2.155-2.157 2.155z"/>
              </svg>
              Continue with Discord
            </button>
            <small class="discord-login-note">You will continue securely on Discord.</small>
          </div>
        </div>
      </div>
    </Transition>
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
    <Transition name="assistant-popover">
      <section v-if="open" class="assistant-panel" aria-label="Lumen Docs Assistant">
        <header class="assistant-header">
          <span class="assistant-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 100 100" focusable="false">
              <path d="M37 18h25L45 58h31L57 78H23z" />
            </svg>
            <span class="assistant-banana-mark">🍌</span>
          </span>
          <div class="assistant-title">
            <strong>Lumen Assistant</strong>
            <span>Plugin guide answers</span>
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
            <div class="assistant-music-control">
              <button
                class="assistant-sound assistant-music"
                type="button"
                :aria-label="ambientMusic ? `Turn off ${activeMusicTrack} music` : selectedMusicTrack ? `Play ${selectedMusicTrack} soundtrack` : 'Play a random ambient soundscape'"
                :aria-pressed="ambientMusic"
                :title="ambientMusic ? `Now playing: ${activeMusicTrack} (click to stop)` : selectedMusicTrack ? `Play ${selectedMusicTrack} soundtrack` : 'Play a random ambient soundscape'"
                @click="toggleAmbientMusic"
              >
                {{ ambientMusic ? '♫' : '♬' }}
              </button>
            </div>
            <button class="assistant-close" type="button" aria-label="Close assistant" @click="open = false">
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
          </div>
        </header>

        <details class="assistant-audio-settings">
          <summary>Sound settings</summary>
          <label class="assistant-track-picker">
            <span>Soundtrack</span>
            <select
              v-model="selectedMusicTrack"
              aria-label="Select ambient soundtrack"
              @change="handleMusicTrackSelection"
            >
              <option value="">Random ambient tracks</option>
              <option
                v-for="track in selectableAmbientTracks"
                :key="track.name"
                :value="track.name"
                :title="track.description"
              >
                {{ track.name }}
              </option>
            </select>
          </label>
          <div v-if="ambientMusic" class="assistant-audio-options">
            <label class="assistant-volume-control">
              <span class="assistant-volume-icon" aria-hidden="true">♫</span>
              <input
                v-model.number="musicVolume"
                type="range"
                min="0"
                max="300"
                step="1"
                aria-label="Ambient music volume"
                :aria-valuetext="`${musicVolume}%`"
                :style="{ '--assistant-volume': `${musicVolume / 3}%` }"
                @input="updateMusicVolume"
              >
            </label>
            <label class="assistant-animation-toggle">
              <input
                v-model="musicAnimationsEnabled"
                type="checkbox"
                aria-label="Enable soundtrack animations"
                @change="updateMusicAnimationPreference"
              >
              <span>Animations</span>
            </label>
          </div>
        </details>

        <div ref="conversation" class="assistant-conversation" aria-live="polite">
          <template v-if="assistantView === 'chat'">
            <div v-if="!hasQuestion" class="assistant-welcome">
              <span class="assistant-eyebrow">LUMEN STUDIOS</span>
              <h2>How can I help?</h2>
              <p>Get quick answers from our plugin guides.</p>
              <div class="assistant-suggestions" aria-label="Suggested questions">
                <button type="button" @click="useSuggestedQuestion('How do I install a plugin?')">Install a plugin</button>
                <button type="button" @click="useSuggestedQuestion('How do I configure a plugin?')">Configuration help</button>
              </div>
              <button class="assistant-report-link" type="button" @click="showBugReport">Report a plugin issue</button>
            </div>
            <article v-for="(answer, index) in answers" :key="`${index}-${answer.question}`" class="assistant-answer">
              <p class="assistant-question">{{ answer.question }}</p>
              <p class="assistant-response">{{ answer.reply }}</p>
              <div v-if="answer.tracklist" class="assistant-tracklist" aria-label="Available soundtracks">
                <article v-for="track in tracklistTracks" :key="track.name" class="assistant-tracklist-item">
                  <div>
                    <strong>{{ track.name }}</strong>
                    <span>{{ track.description }} · {{ formatTrackTime(getTrackDuration(track)) }}</span>
                    <div class="assistant-tracklist-seek">
                      <input
                        type="range"
                        min="0"
                        :max="getTrackDuration(track) - 1"
                        step="1"
                        :value="activeMusicTrack === track.name ? Math.floor(trackPositionSeconds) : 0"
                        :disabled="activeMusicTrack !== track.name"
                        :aria-label="`Seek ${track.name}`"
                        :aria-valuetext="`${formatTrackTime(activeMusicTrack === track.name ? trackPositionSeconds : 0)} of ${formatTrackTime(getTrackDuration(track))}`"
                        @input="seekTrack(track.name, Number(($event.target as HTMLInputElement).value))"
                      >
                      <small>{{ formatTrackTime(activeMusicTrack === track.name ? trackPositionSeconds : 0) }} / {{ formatTrackTime(getTrackDuration(track)) }}</small>
                    </div>
                  </div>
                  <button
                    type="button"
                    :disabled="activeMusicTrack === track.name"
                    :aria-label="activeMusicTrack === track.name ? `${track.name} is playing` : `Play ${track.name}`"
                    @click="playTrackFromTracklist(track.name)"
                  >
                    {{ activeMusicTrack === track.name ? 'Playing' : 'Play' }}
                  </button>
                </article>
              </div>
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
          </template>
          <form v-else class="assistant-bug-form" @submit.prevent="submitBugReport">
            <div class="assistant-bug-heading">
              <button type="button" class="assistant-back-button" @click="assistantView = 'chat'">← Assistant</button>
              <strong>Report a bug</strong>
              <span>Tell us what happened and we’ll take a look.</span>
            </div>
            <label>
              <span>Plugin name</span>
              <input v-model="bugReport.plugin" type="text" maxlength="100" required placeholder="e.g. LumenShards">
            </label>
            <div class="assistant-bug-row">
              <label>
                <span>Server software</span>
                <input v-model="bugReport.serverSoftware" type="text" maxlength="100" required placeholder="e.g. Paper">
              </label>
              <label>
                <span>Version number</span>
                <input v-model="bugReport.version" type="text" maxlength="60" required placeholder="e.g. 1.21.4">
              </label>
            </div>
            <p class="assistant-field-hint">Connect Discord with Log in before submitting. Remove all credentials from logs; staff reply in your website ticket.</p>
            <label>
              <span>Console log message <small>Optional</small></span>
              <textarea v-model="bugReport.consoleLog" maxlength="2000" rows="3" placeholder="Paste the relevant error or warning"></textarea>
            </label>
            <label>
              <span>Description of what happened</span>
              <textarea v-model="bugReport.description" maxlength="2000" rows="3" required placeholder="What did you expect, and what happened instead?"></textarea>
            </label>
            <p v-if="bugReportError" class="assistant-bug-error" role="alert">{{ bugReportError }}</p>
            <p v-if="bugReportSent" class="assistant-bug-success" role="status">Your private website ticket is saved. <a href="/account/tickets">View my tickets →</a></p>
            <button class="assistant-bug-submit" type="submit" :disabled="submittingBugReport || bugReportSent || !discordUser">
              {{ submittingBugReport ? 'Sending report…' : bugReportSent ? 'Report sent' : 'Send bug report' }}
            </button>
          </form>
        </div>

        <form v-if="assistantView === 'chat'" class="assistant-form" @submit.prevent="askQuestion">
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
        <div v-if="assistantView === 'chat'" class="assistant-note">
          <span>{{ assistantEndpoint ? 'Questions and selected guide excerpts are sent to DeepSeek. Full plugin source code and ZIP archives are not sent.' : 'Local guide search is active. AI replies need a secure backend.' }}</span>
          <button type="button" @click="openBugReport">Report a bug</button>
        </div>
      </section>
    </Transition>
  </div>
</template>
