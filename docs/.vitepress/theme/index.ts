import DefaultTheme from 'vitepress/theme'
import { h, defineComponent, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vitepress'
import DocsAssistant from './DocsAssistant.vue'
import './custom.css'

export default {
  ...DefaultTheme,
  Layout: defineComponent({
    setup() {
      const router = useRouter()
      const previousRouteChanged = router.onAfterRouteChange
      const canGoBack = ref(false)
      const canGoForward = ref(false)
      let traversingHistory = false
      let currentPath = router.route.path
      let slideFromLeft = true
      let sunClicks = 0
      let moonClicks = 0
      let ambientWeatherTimer: number | undefined
      const ambientWeatherTimers: number[] = []
      let balloonPopTimer: number | undefined
      let sunExplosionAudio: AudioContext | undefined
      let sunExplosionCleanupTimer: number | undefined
      const defaultFavicon = '/assets/lumen-logo.png'
      const bananaFavicon = '/assets/banana-logo.svg'
      const minecraftToast = ref('')
      let minecraftToastTimer: number | undefined
      let phraseBuffer = ''
      let minecraftModeEnabled = false
      let bananaModeEnabled = false
      let konamiIndex = 0
      const konamiCode = [
        'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
        'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a',
      ]

      const toggleMinecraftMode = () => {
        const root = document.documentElement
        const enabled = !root.classList.contains('lumen-minecraft')
        root.classList.toggle('lumen-minecraft', enabled)
        minecraftModeEnabled = enabled
        if (enabled && bananaModeEnabled) {
          root.classList.remove('lumen-banana')
          bananaModeEnabled = false
          updateFavicon(false)
        }
        window.dispatchEvent(new CustomEvent('lumen-theme-mode-change'))
        minecraftToast.value = enabled ? 'Minecraft mode enabled' : 'Minecraft mode disabled'
        window.clearTimeout(minecraftToastTimer)
        minecraftToastTimer = window.setTimeout(() => { minecraftToast.value = '' }, 2400)
      }

      const toggleBananaMode = () => {
        const root = document.documentElement
        const enabled = !root.classList.contains('lumen-banana')
        root.classList.toggle('lumen-banana', enabled)
        bananaModeEnabled = enabled
        updateFavicon(enabled)
        if (enabled && minecraftModeEnabled) {
          root.classList.remove('lumen-minecraft')
          minecraftModeEnabled = false
        }
        window.dispatchEvent(new CustomEvent('lumen-theme-mode-change'))
        minecraftToast.value = enabled ? '🍌 Banana mode! 🍌' : 'Banana mode off'
        window.clearTimeout(minecraftToastTimer)
        minecraftToastTimer = window.setTimeout(() => { minecraftToast.value = '' }, 2400)
      }

      const updateFavicon = (banana: boolean) => {
        document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach(icon => {
          icon.href = banana ? bananaFavicon : defaultFavicon
          icon.type = banana ? 'image/svg+xml' : 'image/png'
        })
      }

      const handleBalloonPop = (event: MouseEvent) => {
        const root = document.documentElement
        root.style.setProperty('--lumen-pop-x', `${event.clientX}px`)
        root.style.setProperty('--lumen-pop-y', `${event.clientY}px`)
        root.classList.remove('lumen-weather-balloon-event')
        root.classList.add('lumen-balloon-popped')
        window.clearTimeout(balloonPopTimer)
        balloonPopTimer = window.setTimeout(() => {
          root.classList.remove('lumen-balloon-popped')
        }, 4200)
      }

      const handlePointerMove = (event: PointerEvent) => {
        if (!bananaModeEnabled) return
        document.documentElement.style.setProperty('--lumen-cursor-x', `${event.clientX}px`)
        document.documentElement.style.setProperty('--lumen-cursor-y', `${event.clientY}px`)
      }

      const handleSecretKeys = (event: KeyboardEvent) => {
        const target = event.target
        if (target instanceof HTMLElement &&
          (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
          return
        }

        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
        const expectedKey = konamiCode[konamiIndex]
        if (key === expectedKey) {
          konamiIndex += 1
          if (konamiIndex === konamiCode.length) {
            konamiIndex = 0
            phraseBuffer = ''
            toggleMinecraftMode()
            return
          }
          if (key.startsWith('Arrow')) event.preventDefault()
        } else {
          konamiIndex = key === konamiCode[0] ? 1 : 0
        }

        if (/^[a-z]$/.test(key)) {
          phraseBuffer = (phraseBuffer + key).slice(-'minecraft'.length)
          if (phraseBuffer.endsWith('minecraft')) {
            phraseBuffer = ''
            konamiIndex = 0
            toggleMinecraftMode()
          } else if (phraseBuffer.endsWith('banana')) {
            phraseBuffer = ''
            konamiIndex = 0
            toggleBananaMode()
          }
        } else if (!key.startsWith('Arrow')) {
          phraseBuffer = ''
        }
      }

      const scheduleAmbientWeather = () => {
        ambientWeatherTimer = window.setTimeout(() => {
          const root = document.documentElement
          const isDark = root.classList.contains('dark')

          const startEvent = (eventClass: string, duration: number) => {
            if (root.classList.contains(eventClass)) return
            root.classList.add(eventClass)
            ambientWeatherTimers.push(window.setTimeout(() => {
              root.classList.remove(eventClass)
            }, duration))
          }

          if (isDark) {
            if (Math.random() < 0.22) startEvent('lumen-weather-meteors', 15000)
          } else {
            if (Math.random() < 0.72) startEvent('lumen-weather-rain', 24000)
            if (Math.random() < 0.18) startEvent('lumen-weather-balloon-event', 16000)
          }

          scheduleAmbientWeather()
        }, 25000 + Math.random() * 20000)
      }

      const playSunExplosion = () => {
        if (!window.AudioContext) return

        try {
          sunExplosionAudio = new AudioContext()
          const context = sunExplosionAudio
          const now = context.currentTime
          const master = context.createGain()
          master.gain.setValueAtTime(0.42, now)
          master.connect(context.destination)

          const boom = context.createOscillator()
          const boomVolume = context.createGain()
          boom.type = 'triangle'
          boom.frequency.setValueAtTime(78, now)
          boom.frequency.exponentialRampToValueAtTime(24, now + 1.8)
          boomVolume.gain.setValueAtTime(0.0001, now)
          boomVolume.gain.exponentialRampToValueAtTime(0.8, now + 0.035)
          boomVolume.gain.exponentialRampToValueAtTime(0.0001, now + 2.6)
          boom.connect(boomVolume)
          boomVolume.connect(master)
          boom.start(now)
          boom.stop(now + 2.65)

          const noiseBuffer = context.createBuffer(1, context.sampleRate * 2.5, context.sampleRate)
          const samples = noiseBuffer.getChannelData(0)
          for (let index = 0; index < samples.length; index += 1) {
            samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length)
          }

          const blast = context.createBufferSource()
          const blastFilter = context.createBiquadFilter()
          const blastVolume = context.createGain()
          blast.buffer = noiseBuffer
          blastFilter.type = 'lowpass'
          blastFilter.frequency.setValueAtTime(1800, now)
          blastFilter.frequency.exponentialRampToValueAtTime(110, now + 2.3)
          blastVolume.gain.setValueAtTime(0.0001, now)
          blastVolume.gain.exponentialRampToValueAtTime(0.48, now + 0.025)
          blastVolume.gain.exponentialRampToValueAtTime(0.0001, now + 2.35)
          blast.connect(blastFilter)
          blastFilter.connect(blastVolume)
          blastVolume.connect(master)
          blast.start(now)
          blast.stop(now + 2.4)

          sunExplosionCleanupTimer = window.setTimeout(() => {
            void context.close().catch(error => {
              console.error('Unable to close sun explosion audio:', error)
            })
            sunExplosionAudio = undefined
          }, 3000)
        } catch (error) {
          console.error('Unable to play sun explosion sound:', error)
        }
      }

      const handleSkyClick = () => {
        const root = document.documentElement
        if (root.classList.contains('lumen-sun-exploded') || root.classList.contains('lumen-moon-flooded')) return

        if (root.classList.contains('dark')) {
          moonClicks += 1
          if (moonClicks === 10) root.classList.add('lumen-moon-flooded')
        } else {
          sunClicks += 1
          if (sunClicks === 10) {
            root.classList.add('lumen-sun-exploded')
            playSunExplosion()
          }
        }
      }

      const handlePopState = () => {
        traversingHistory = true
        canGoForward.value = true
        canGoBack.value = window.history.length > 1
      }

      const addInlineCopyButtons = () => {
        document.querySelectorAll<HTMLElement>('.VPDoc .vp-doc code:not(pre code)').forEach(code => {
          if (code.dataset.copyButton === 'true' || code.closest('a')) return
          code.dataset.copyButton = 'true'

          const button = document.createElement('button')
          button.className = 'lumen-inline-copy'
          button.type = 'button'
          button.textContent = 'Copy'
          button.setAttribute('aria-label', `Copy ${code.textContent ?? 'code'}`)
          button.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(code.textContent ?? '')
              button.textContent = 'Copied'
              window.setTimeout(() => { button.textContent = 'Copy' }, 1200)
            } catch (error) {
              console.error('Could not copy documentation text:', error)
              button.textContent = 'Failed'
              window.setTimeout(() => { button.textContent = 'Copy' }, 1600)
            }
          })
          code.after(button)
        })
      }

      const animatePage = async (nextPath: string) => {
        await previousRouteChanged?.(nextPath)
        await nextTick()
        addInlineCopyButtons()
        if (traversingHistory) {
          traversingHistory = false
        } else {
          canGoForward.value = false
        }
        canGoBack.value = window.history.length > 1
        if (nextPath === currentPath) return
        currentPath = nextPath

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

        const fromX = slideFromLeft ? -36 : 36
        slideFromLeft = !slideFromLeft
        document.querySelector('.VPContent')?.animate(
          [
            { opacity: 0.6, transform: `translate3d(${fromX}px, 0, 0)` },
            { opacity: 1, transform: 'translate3d(0, 0, 0)' },
          ],
          { duration: 240, easing: 'cubic-bezier(0.2, 0.75, 0.3, 1)' },
        )
      }

      router.onAfterRouteChange = animatePage
      onMounted(() => {
        canGoBack.value = window.history.length > 1
        window.addEventListener('popstate', handlePopState)
        window.addEventListener('keydown', handleSecretKeys)
        window.addEventListener('pointermove', handlePointerMove)
        addInlineCopyButtons()
        scheduleAmbientWeather()
      })
      onUnmounted(() => {
        router.onAfterRouteChange = previousRouteChanged
        window.removeEventListener('popstate', handlePopState)
        window.removeEventListener('keydown', handleSecretKeys)
        window.removeEventListener('pointermove', handlePointerMove)
        window.clearTimeout(ambientWeatherTimer)
        window.clearTimeout(minecraftToastTimer)
        window.clearTimeout(balloonPopTimer)
        window.clearTimeout(sunExplosionCleanupTimer)
        void sunExplosionAudio?.close()
        ambientWeatherTimers.forEach(timer => window.clearTimeout(timer))
        document.documentElement.classList.remove(
          'lumen-minecraft',
          'lumen-banana',
          'lumen-weather-meteors',
          'lumen-weather-rain',
          'lumen-weather-balloon-event',
          'lumen-balloon-popped',
        )
        updateFavicon(false)
      })

      return () => h(DefaultTheme.Layout, null, {
        'layout-top': () => [
          h('div', { class: 'lumen-sky', 'aria-hidden': 'true' }, [
            ...Array.from({ length: 10 }, (_, index) =>
              h('span', { class: `lumen-pixel-star lumen-pixel-star-${index + 1}` }),
            ),
            ...Array.from({ length: 3 }, (_, index) =>
              h('span', { class: `lumen-shooting-star lumen-shooting-star-${index + 1}` }),
            ),
          ]),
          h('div', { class: 'lumen-weather-sky' }, [
            ...Array.from({ length: 12 }, (_, index) =>
              h('span', { class: `lumen-event-meteor lumen-event-meteor-${index + 1}` }),
            ),
            ...Array.from({ length: 3 }, (_, index) =>
              h('span', { class: `lumen-weather-cloud lumen-weather-cloud-${index + 1}` }),
            ),
            ...Array.from({ length: 32 }, (_, index) =>
              h('span', { class: `lumen-rain-drop lumen-rain-drop-${index + 1}` }),
            ),
            h('button', {
              class: 'lumen-weather-balloon',
              type: 'button',
              'aria-label': 'Pop the balloon and release confetti',
              title: 'Pop the balloon!',
              onClick: handleBalloonPop,
            }, [
              h('span', { class: 'lumen-balloon-string' }),
            ]),
            ...Array.from({ length: 8 }, (_, index) =>
              h('span', { class: `lumen-firefly lumen-firefly-${index + 1}` }),
            ),
            h('span', { class: 'lumen-tide-wave lumen-tide-wave-1' }),
            h('span', { class: 'lumen-tide-wave lumen-tide-wave-2' }),
          ]),
          h('div', { class: 'lumen-banana-sky', 'aria-hidden': 'true' },
            [
              ...Array.from({ length: 24 }, (_, index) =>
                h('span', { class: `lumen-falling-banana lumen-falling-banana-${index + 1}` }, '🍌'),
              ),
              ...Array.from({ length: 18 }, (_, index) =>
                h('span', { class: `lumen-falling-monkey lumen-falling-monkey-${index + 1}` }, [
                  h('span', { class: 'lumen-monkey-eyes' }),
                ]),
              ),
            ],
          ),
          h('div', { class: 'lumen-minecraft-sky', 'aria-hidden': 'true' },
            Array.from({ length: 18 }, (_, index) =>
              h('span', { class: `lumen-dirt-block lumen-dirt-block-${index + 1}` }),
            ),
          ),
          h('span', { class: 'lumen-banana-cursor', 'aria-hidden': 'true' }, '🍌'),
          h('div', { class: 'lumen-balloon-confetti', 'aria-hidden': 'true' },
            Array.from({ length: 48 }, (_, index) =>
              h('span', { class: `lumen-confetti-piece lumen-confetti-piece-${index + 1}` }),
            ),
          ),
          h('div', { class: 'lumen-disaster-overlay', 'aria-hidden': 'true' }, [
            h('span', { class: 'lumen-disaster-flash' }),
            h('span', { class: 'lumen-disaster-ring' }),
            ...Array.from({ length: 12 }, (_, index) =>
              h('span', { class: `lumen-disaster-debris lumen-disaster-debris-${index + 1}` }),
            ),
            ...Array.from({ length: 3 }, (_, index) =>
              h('span', { class: `lumen-flood-wave lumen-flood-wave-${index + 1}` }),
            ),
          ]),
          h('div', { class: 'lumen-mode-toast', role: 'status', 'aria-live': 'polite' }, minecraftToast.value),
          h('button', {
            class: 'lumen-pixel-moon',
            type: 'button',
            'aria-label': bananaModeEnabled
              ? 'Banana: click 10 times for a surprise'
              : 'Sun or moon: click 10 times for a surprise',
            title: bananaModeEnabled
              ? 'Click the banana 10 times for a surprise'
              : 'Click 10 times for a surprise',
            onClick: handleSkyClick,
          }),
        ],
        'nav-bar-content-after': () => h('div', { class: 'lumen-history-controls' }, [
          h('button', {
            type: 'button',
            disabled: !canGoBack.value,
            'aria-label': 'Go back',
            title: 'Go back',
            onClick: () => window.history.back(),
          }, '<-'),
          h('button', {
            type: 'button',
            disabled: !canGoForward.value,
            'aria-label': 'Go forward',
            title: 'Go forward',
            onClick: () => window.history.forward(),
          }, '->'),
        ]),
        'layout-bottom': () => h(DocsAssistant),
      })
    },
  }),
}
