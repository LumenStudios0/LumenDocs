<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { withBase } from 'vitepress'

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
const assistantView = ref<'chat' | 'bug-report'>('chat')
const bugReport = ref({
  plugin: '',
  serverSoftware: '',
  version: '',
  discordUsername: '',
  productKey: '',
  consoleLog: '',
  description: '',
})
const submittingBugReport = ref(false)
const bugReportError = ref('')
const bugReportSent = ref(false)
const clickSounds = ref(true)
const ambientMusic = ref(false)
const musicVolume = ref(35)
const activeMusicTrack = ref('')
const selectedMusicTrack = ref('')
const assistantEndpoint = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
let audioContext: AudioContext | undefined
let musicMaster: GainNode | undefined
let musicOutput: GainNode | undefined
let musicFilter: BiquadFilterNode | undefined
let musicOscillators: OscillatorNode[] = []
let musicSources: AudioScheduledSourceNode[] = []
let musicTimer: number | undefined
let noteTimer: number | undefined
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

function getAudioContextConstructor() {
  return window.AudioContext ?? window.webkitAudioContext
}

interface AmbientTrack {
  name: string
  description: string
  secret?: boolean
  modeOnly?: 'banana' | 'minecraft' | 'dinosaur'
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
    modeOnly: 'minecraft',
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
  {
    name: 'Cretaceous Sunrise',
    description: 'An original, cinematic prehistoric adventure with warm strings, soaring bells, and gentle dinosaur drums.',
    modeOnly: 'dinosaur',
    masterVolume: 0.075,
    waveform: 'triangle',
    filterFrequency: 2600,
    chordInterval: 4800,
    chordVolume: 0.11,
    notes: {
      frequencies: [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 293.66],
      waveform: 'sine',
      volume: 0.095,
      attack: 0.12,
      decay: 1.1,
      interval: 620,
    },
    rhythm: {
      steps: [82.41, null, 110, null, 98, null, 123.47, null],
      stepMs: 760,
      volume: 0.035,
      decay: 0.8,
      waveform: 'triangle',
      filter: 'lowpass',
      filterFrequency: 220,
    },
    chords: [
      [130.81, 196, 261.63, 329.63],
      [146.83, 220, 293.66, 369.99],
      [164.81, 246.94, 329.63, 392],
      [110, 164.81, 220, 293.66],
    ],
  },
]

const ambientTrackClasses = ambientTracks.map(track =>
  `lumen-track-${track.name.toLowerCase().replace(/\s+/g, '-')}`,
)
const selectableAmbientTracks = ambientTracks.filter(track => !track.secret && !track.modeOnly)

function setAmbientTrackEffect(trackName?: string) {
  const root = document.documentElement
  root.classList.remove(...ambientTrackClasses)
  if (trackName) {
    root.classList.add(`lumen-track-${trackName.toLowerCase().replace(/\s+/g, '-')}`)
  }
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

function getBugReportEndpoint() {
  if (!assistantEndpoint) return ''

  const endpoint = new URL(assistantEndpoint, window.location.origin)
  endpoint.pathname = endpoint.pathname.replace(/\/chat\/?$/, '') + '/bug-report'
  endpoint.search = ''
  return endpoint.toString()
}

async function submitBugReport() {
  if (submittingBugReport.value) return
  const endpoint = getBugReportEndpoint()
  if (!endpoint) {
    bugReportError.value = 'Bug reports are temporarily unavailable. Please contact us on Discord.'
    return
  }

  submittingBugReport.value = true
  bugReportError.value = ''
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bugReport.value),
    })
    const result = await response.json().catch(() => ({})) as { error?: string; ok?: boolean }
    if (!response.ok || !result.ok) {
      throw new Error(result.error || 'Could not deliver the report. Please try again later.')
    }

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

function startAmbientMusic() {
  if (!audioContext || audioContext.state !== 'running') {
    throw new Error('The audio context is not running.')
  }

  const now = audioContext.currentTime
  const bananaTrackIndex = ambientTracks.findIndex(track => track.modeOnly === 'banana')
  const minecraftTrackIndex = ambientTracks.findIndex(track => track.modeOnly === 'minecraft')
  const dinosaurTrackIndex = ambientTracks.findIndex(track => track.modeOnly === 'dinosaur')
  const secretTrackIndex = ambientTracks.findIndex(track => track.secret)
  const isBananaMode = document.documentElement.classList.contains('lumen-banana')
  const isMinecraftMode = document.documentElement.classList.contains('lumen-minecraft')
  const isDinosaurMode = document.documentElement.classList.contains('lumen-dino-soundtrack')
  const selectedTrackIndex = ambientTracks.findIndex(track =>
    track.name === selectedMusicTrack.value && !track.secret && !track.modeOnly,
  )
  const playSecretTrack = selectedTrackIndex < 0 &&
    !isBananaMode && !isMinecraftMode && !isDinosaurMode && Math.random() < 0.01
  const availableTracks = ambientTracks
    .map((_, index) => index)
    .filter(index => !ambientTracks[index].secret && !ambientTracks[index].modeOnly && index !== lastMusicTrack)
  const trackIndex = isDinosaurMode || isBananaMode || isMinecraftMode
    ? isDinosaurMode ? dinosaurTrackIndex : isBananaMode ? bananaTrackIndex : minecraftTrackIndex
    : playSecretTrack
      ? secretTrackIndex
      : selectedTrackIndex >= 0
        ? selectedTrackIndex
        : availableTracks[Math.floor(Math.random() * availableTracks.length)]
  if (trackIndex < 0) throw new Error('No ambient music tracks are available.')
  activeTrack = ambientTracks[trackIndex]
  activeMusicTrack.value = activeTrack.name
  lastMusicTrack = trackIndex

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
    rhythmStepIndex = 0
    const playRhythmStep = () => {
      if (!audioContext || !musicMaster || activeTrack?.rhythm !== rhythm) return

      const frequency = rhythm.steps[rhythmStepIndex % rhythm.steps.length]
      rhythmStepIndex += 1
      if (frequency === null) return

      const beatAt = audioContext.currentTime
      const beatFilter = rhythm.filter ? audioContext.createBiquadFilter() : undefined
      if (beatFilter) {
        beatFilter.type = rhythm.filter
        beatFilter.frequency.setValueAtTime(rhythm.filterFrequency ?? 1400, beatAt)
        beatFilter.connect(musicMaster)
      }

      const partials = [{ ratio: 1, level: 1 }, ...(rhythm.partials ?? [])]
      for (const partial of partials) {
        const beat = audioContext.createOscillator()
        const beatVolume = audioContext.createGain()
        const partialFrequency = frequency * partial.ratio
        beat.type = rhythm.waveform
        beat.frequency.setValueAtTime(partialFrequency, beatAt)
        beatVolume.gain.setValueAtTime(0.0001, beatAt)
        beatVolume.gain.linearRampToValueAtTime(rhythm.volume * partial.level, beatAt + 0.025)
        beatVolume.gain.exponentialRampToValueAtTime(0.0001, beatAt + rhythm.decay)
        beat.connect(beatVolume)
        if (beatFilter) beatVolume.connect(beatFilter)
        else beatVolume.connect(musicMaster)
        beat.start(beatAt)
        beat.stop(beatAt + rhythm.decay + 0.02)
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
    musicChordIndex = 0
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

  musicNoteIndex = 0
  if (activeTrack.notes) {
    const playTrackNote = () => {
      if (!audioContext || !activeTrack?.notes || !musicFilter) return
      const instrument = activeTrack.notes
      const changeAt = audioContext.currentTime
      const frequency = instrument.frequencies[activeTrack.chaotic
        ? Math.floor(Math.random() * instrument.frequencies.length)
        : musicNoteIndex % instrument.frequencies.length]
      musicNoteIndex += 1
      if (frequency === null) return
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

function handleDinosaurSoundtrack() {
  if (ambientMusic.value && audioContext) {
    stopAmbientMusic(0.12)
    try {
      startAmbientMusic()
    } catch (error) {
      console.error('Unable to start the dinosaur soundtrack:', error)
      activeMusicTrack.value = ''
    }
    return
  }
  void toggleAmbientMusic()
}

function stopAmbientMusic(fadeDuration = 1.2) {
  setAmbientTrackEffect()
  if (!audioContext || !musicMaster) return

  window.clearInterval(musicTimer)
  musicTimer = undefined
  window.clearInterval(noteTimer)
  noteTimer = undefined
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
  if (!ambientMusic.value && document.documentElement.classList.contains('lumen-dino-soundtrack')) {
    void toggleAmbientMusic()
    return
  }
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
  window.addEventListener('lumen-dinosaur-soundtrack', handleDinosaurSoundtrack)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', playClickSound, true)
  document.removeEventListener('pointerdown', resumeAmbientMusic, true)
  window.removeEventListener('lumen-theme-mode-change', handleThemeModeChange)
  window.removeEventListener('lumen-dinosaur-soundtrack', handleDinosaurSoundtrack)
  window.removeEventListener('keydown', onKeydown)
  window.clearInterval(musicTimer)
  window.clearInterval(noteTimer)
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
      class="assistant-report-launcher"
      type="button"
      aria-label="Report a plugin bug"
      @click="showBugReport"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 8v9M8.5 10 5 7.5M15.5 10 19 7.5M8 13H4.5M16 13h3.5M9 5.5 7.5 3M15 5.5 16.5 3M8 17l-2 2M16 17l2 2" />
        <path d="M8 11a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0zM10 6h4" />
      </svg>
      <span>Report a bug</span>
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
    <div v-if="ambientMusic && !open" class="assistant-music-control">
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
    </div>
    <button
      v-if="!open"
      class="assistant-sound assistant-music"
      type="button"
      :aria-label="ambientMusic ? `Turn off ${activeMusicTrack} music` : selectedMusicTrack ? `Play ${selectedMusicTrack} soundtrack` : 'Play a random ambient soundscape'"
      :aria-pressed="ambientMusic"
      :title="ambientMusic ? `Now playing: ${activeMusicTrack} (click to stop)` : selectedMusicTrack ? `Play ${selectedMusicTrack} soundtrack` : 'Play a random ambient soundscape'"
      @click="toggleAmbientMusic"
    >
      {{ ambientMusic ? '♫' : '♬' }}
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
              <label v-if="ambientMusic" class="assistant-volume-control">
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

        <div ref="conversation" class="assistant-conversation" aria-live="polite">
          <template v-if="assistantView === 'chat'">
            <div v-if="!hasQuestion" class="assistant-welcome">
              <span class="assistant-eyebrow">LUMEN STUDIOS</span>
              <h2>How can I help?</h2>
              <p>Get quick answers from our plugin guides.</p>
              <div class="assistant-suggestions" aria-label="Suggested questions">
                <button type="button" @click="useSuggestedQuestion('How do I install a plugin?')">Install a plugin</button>
                <button type="button" @click="useSuggestedQuestion('Show me the available commands and permissions')">Commands &amp; permissions</button>
                <button type="button" @click="useSuggestedQuestion('How do I configure a plugin?')">Configuration help</button>
              </div>
            </div>
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
            <label>
              <span>Discord username <small>Optional</small></span>
              <input v-model="bugReport.discordUsername" type="text" maxlength="100" autocomplete="off" placeholder="How support can reach you">
            </label>
            <label>
              <span>Product key <small>Optional</small></span>
              <input v-model="bugReport.productKey" type="text" maxlength="200" autocomplete="off" placeholder="Only if relevant to the issue">
              <small class="assistant-field-hint">This will be shared in the report channel. Include it only if support needs it; never include passwords.</small>
            </label>
            <label>
              <span>Console log message <small>Optional</small></span>
              <textarea v-model="bugReport.consoleLog" maxlength="2000" rows="3" placeholder="Paste the relevant error or warning"></textarea>
            </label>
            <label>
              <span>Description of what happened</span>
              <textarea v-model="bugReport.description" maxlength="2000" rows="3" required placeholder="What did you expect, and what happened instead?"></textarea>
            </label>
            <p v-if="bugReportError" class="assistant-bug-error" role="alert">{{ bugReportError }}</p>
            <p v-if="bugReportSent" class="assistant-bug-success" role="status">Thanks — your report was sent to the Lumen Studios team.</p>
            <button class="assistant-bug-submit" type="submit" :disabled="submittingBugReport || bugReportSent">
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
