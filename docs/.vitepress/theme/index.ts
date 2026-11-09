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
      const currentPath = ref(router.route.path)
      const dinoEggPath = ref('')
      const dinoEggPosition = ref({ left: '12%', top: '74%' })
      const dinoEggsFound = ref(0)
      const dinoCountdown = ref(0)
      const dinoToast = ref('')
      let traversingHistory = false
      let slideFromLeft = true
      let sunClicks = 0
      let moonClicks = 0
      let ambientWeatherTimer: number | undefined
      const ambientWeatherTimers: number[] = []
      let balloonPopTimer: number | undefined
      let sunExplosionAudio: AudioContext | undefined
      let sunExplosionCleanupTimer: number | undefined
      let floodImpactAudio: AudioContext | undefined
      let floodImpactCleanupTimer: number | undefined
      let dinosaurAudio: AudioContext | undefined
      let dinosaurAudioCleanupTimer: number | undefined
      let dinosaurCountdownTimer: number | undefined
      let dinosaurLockdownTimer: number | undefined
      let dinosaurToastTimer: number | undefined
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
      const dinosaurEggRoutes = [
        '/', '/plugins/', '/getting-started/', '/getting-started/installation',
        '/getting-started/compatibility', '/getting-started/licensing',
        '/products/gladiator', '/products/lumen-auction', '/products/lumen-bounty',
        '/products/lumen-duels', '/products/lumen-duels-premium', '/products/lumen-economy',
        '/products/lumen-essentials', '/products/lumen-order', '/products/lumen-shards',
        '/products/lumen-spawners', '/products/lumen-spoofer', '/troubleshooting',
        '/changelogs/', '/changelogs/updates', '/keyboard-shortcuts',
      ]

      const selectDinosaurEggPages = () => {
        try {
          const saved = sessionStorage.getItem('lumen-dino-egg-pages')
          const pages = saved ? JSON.parse(saved) as string[] : []
          if (pages.length === 3 && pages.every(path => dinosaurEggRoutes.includes(path))) return pages
          const shuffled = [...dinosaurEggRoutes]
          for (let index = shuffled.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1))
            ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
          }
          const selected = shuffled.slice(0, 3)
          sessionStorage.setItem('lumen-dino-egg-pages', JSON.stringify(selected))
          return selected
        } catch (error) {
          console.error('Unable to save dinosaur egg locations:', error)
          return dinosaurEggRoutes.slice(0, 3)
        }
      }

      let dinosaurEggPages = dinosaurEggRoutes.slice(0, 3)
      const readFoundEggs = () => {
        try {
          const saved = sessionStorage.getItem('lumen-dino-eggs-found')
          const found = saved ? JSON.parse(saved) as string[] : []
          return found.filter(path => dinosaurEggPages.includes(path))
        } catch (error) {
          console.error('Unable to read dinosaur egg progress:', error)
          return []
        }
      }
      const foundEggPages = new Set<string>()
      const completedDinosaurEvent = () => {
        try {
          return localStorage.getItem('lumen-dino-extinction') === 'true'
        } catch (error) {
          console.error('Unable to read dinosaur event progress:', error)
          return false
        }
      }

      const setDinosaurToast = (message: string) => {
        dinoToast.value = message
        window.clearTimeout(dinosaurToastTimer)
        dinosaurToastTimer = window.setTimeout(() => { dinoToast.value = '' }, 3400)
      }

      const playDinosaurHatchSound = () => {
        if (!window.AudioContext) return
        try {
          dinosaurAudio = new AudioContext()
          const context = dinosaurAudio
          const now = context.currentTime
          const master = context.createGain()
          master.gain.setValueAtTime(0.18, now)
          master.connect(context.destination)
          for (const [index, frequency] of [392, 523.25, 659.25].entries()) {
            const chirp = context.createOscillator()
            const gain = context.createGain()
            const start = now + index * 0.095
            chirp.type = 'triangle'
            chirp.frequency.setValueAtTime(frequency, start)
            chirp.frequency.exponentialRampToValueAtTime(frequency * 1.28, start + 0.12)
            gain.gain.setValueAtTime(0.0001, start)
            gain.gain.exponentialRampToValueAtTime(0.5, start + 0.015)
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24)
            chirp.connect(gain)
            gain.connect(master)
            chirp.start(start)
            chirp.stop(start + 0.25)
          }
          dinosaurAudioCleanupTimer = window.setTimeout(() => {
            void context.close().catch(error => console.error('Unable to close dinosaur hatch audio:', error))
            dinosaurAudio = undefined
          }, 600)
        } catch (error) {
          console.error('Unable to play dinosaur hatch sound:', error)
        }
      }

      const registerDinosaurDiscoverer = async () => {
        const endpoint = import.meta.env.VITE_DINO_DISCOVERIES_ENDPOINT
        if (!endpoint) return
        try {
          let visitorId = localStorage.getItem('lumen-dino-visitor-id')
          if (!visitorId) {
            visitorId = crypto.randomUUID()
            localStorage.setItem('lumen-dino-visitor-id', visitorId)
          }
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visitorId }),
          })
          if (!response.ok) throw new Error(`Counter returned HTTP ${response.status}`)
        } catch (error) {
          console.error('Unable to register dinosaur discovery:', error)
          setDinosaurToast('Your dinosaur adventure is safe, but the global fossil counter is offline.')
        }
      }

      const startDinosaurCountdown = () => {
        const root = document.documentElement
        root.classList.add('lumen-dino-countdown', 'lumen-dino-soundtrack')
        window.dispatchEvent(new CustomEvent('lumen-dinosaur-soundtrack'))
        setDinosaurToast('All 3 eggs found! The ground is rumbling...')
        const deadline = Date.now() + 10000
        try {
          localStorage.setItem('lumen-dino-countdown-deadline', String(deadline))
        } catch (error) {
          console.error('Unable to save dinosaur countdown:', error)
        }
        const tick = () => {
          dinoCountdown.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
          if (dinoCountdown.value > 0) return
          window.clearInterval(dinosaurCountdownTimer)
          dinosaurCountdownTimer = undefined
          root.classList.remove('lumen-dino-countdown')
          root.classList.add('lumen-dino-lockdown')
          setDinosaurToast('EMERGENCY LOCKDOWN! Tiny T. rex incoming!')
          try {
            localStorage.removeItem('lumen-dino-countdown-deadline')
            localStorage.setItem('lumen-dino-extinction', 'true')
          } catch (error) {
            console.error('Unable to save dinosaur takeover:', error)
          }
          void registerDinosaurDiscoverer()
          dinosaurLockdownTimer = window.setTimeout(() => {
            root.classList.remove('lumen-dino-lockdown')
            root.classList.add('lumen-dino-extinction')
            window.dispatchEvent(new CustomEvent('lumen-theme-mode-change'))
          }, 3400)
        }
        tick()
        if (dinoCountdown.value > 0) dinosaurCountdownTimer = window.setInterval(tick, 200)
      }

      const discoverDinosaurEgg = () => {
        const page = currentPath.value
        if (!dinosaurEggPages.includes(page) || foundEggPages.has(page)) return
        foundEggPages.add(page)
        dinoEggPath.value = ''
        dinoEggsFound.value = foundEggPages.size
        try {
          sessionStorage.setItem('lumen-dino-eggs-found', JSON.stringify([...foundEggPages]))
        } catch (error) {
          console.error('Unable to save dinosaur egg progress:', error)
        }
        playDinosaurHatchSound()
        document.documentElement.classList.add('lumen-dino-egg-found')
        window.setTimeout(() => document.documentElement.classList.remove('lumen-dino-egg-found'), 1500)
        setDinosaurToast(`Dino Egg ${dinoEggsFound.value} of 3 hatched! ${['A tiny triceratops says hi!', 'That one was hiding from the meteor!', 'Three eggs... something is waking up!'][dinoEggsFound.value - 1]}`)
        if (dinoEggsFound.value === 3) startDinosaurCountdown()
      }

      const resetDinosaurEventOnPageLoad = () => {
        const root = document.documentElement
        root.classList.remove(
          'lumen-dino-countdown',
          'lumen-dino-lockdown',
          'lumen-dino-extinction',
          'lumen-dino-soundtrack',
        )
        try {
          localStorage.removeItem('lumen-dino-countdown-deadline')
          localStorage.removeItem('lumen-dino-extinction')
        } catch (error) {
          console.error('Unable to reset dinosaur event after page load:', error)
        }
      }

      const refreshDinosaurEgg = () => {
        dinoEggPath.value = !completedDinosaurEvent() && !foundEggPages.has(currentPath.value) &&
          dinosaurEggPages.includes(currentPath.value)
          ? currentPath.value
          : ''
        if (dinoEggPath.value) {
          dinoEggPosition.value = {
            left: `${8 + Math.floor(Math.random() * 84)}%`,
            top: `${16 + Math.floor(Math.random() * 72)}%`,
          }
        }
      }

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

      const dinosaurSprite = (variant: 'trex' | 'longneck' | 'triceratops', className: string) =>
        h('svg', {
          class: className,
          viewBox: '0 0 180 140',
          role: 'img',
          'aria-label': `Cute ${variant === 'trex' ? 'T. rex' : variant === 'longneck' ? 'long-necked dinosaur' : 'triceratops'}`,
          focusable: 'false',
        }, [
          h('use', { href: `/assets/dinosaur-sprites.svg#${variant}` }),
        ])

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

      const playFloodImpact = () => {
        if (!window.AudioContext) return

        try {
          floodImpactAudio = new AudioContext()
          const context = floodImpactAudio
          const now = context.currentTime
          const master = context.createGain()
          master.gain.setValueAtTime(0.55, now)
          master.connect(context.destination)

          const impact = context.createOscillator()
          const impactVolume = context.createGain()
          impact.type = 'sine'
          impact.frequency.setValueAtTime(68, now)
          impact.frequency.exponentialRampToValueAtTime(28, now + 1.6)
          impactVolume.gain.setValueAtTime(0.0001, now)
          impactVolume.gain.exponentialRampToValueAtTime(0.75, now + 0.06)
          impactVolume.gain.exponentialRampToValueAtTime(0.0001, now + 1.75)
          impact.connect(impactVolume)
          impactVolume.connect(master)
          impact.start(now)
          impact.stop(now + 1.8)

          const noiseBuffer = context.createBuffer(1, context.sampleRate * 1.7, context.sampleRate)
          const samples = noiseBuffer.getChannelData(0)
          for (let index = 0; index < samples.length; index += 1) {
            samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length)
          }

          const surf = context.createBufferSource()
          const surfFilter = context.createBiquadFilter()
          const surfVolume = context.createGain()
          surf.buffer = noiseBuffer
          surfFilter.type = 'lowpass'
          surfFilter.frequency.setValueAtTime(1300, now)
          surfFilter.frequency.exponentialRampToValueAtTime(130, now + 1.55)
          surfVolume.gain.setValueAtTime(0.0001, now)
          surfVolume.gain.exponentialRampToValueAtTime(0.48, now + 0.08)
          surfVolume.gain.exponentialRampToValueAtTime(0.0001, now + 1.65)
          surf.connect(surfFilter)
          surfFilter.connect(surfVolume)
          surfVolume.connect(master)
          surf.start(now)

          floodImpactCleanupTimer = window.setTimeout(() => {
            void context.close().catch(error => {
              console.error('Unable to close flood impact audio:', error)
            })
            floodImpactAudio = undefined
          }, 2100)
        } catch (error) {
          console.error('Unable to play flood impact sound:', error)
        }
      }

      const handleSkyClick = () => {
        const root = document.documentElement
        if (root.classList.contains('lumen-sun-exploded') || root.classList.contains('lumen-moon-flooded')) return

        if (root.classList.contains('dark')) {
          moonClicks += 1
          if (moonClicks === 10) {
            root.classList.add('lumen-moon-flooded')
            playFloodImpact()
          }
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
        currentPath.value = nextPath
        refreshDinosaurEgg()
        addInlineCopyButtons()
        if (traversingHistory) {
          traversingHistory = false
        } else {
          canGoForward.value = false
        }
        canGoBack.value = window.history.length > 1
        if (nextPath === currentPath.value) return

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
        resetDinosaurEventOnPageLoad()
        dinosaurEggPages = selectDinosaurEggPages()
        readFoundEggs().forEach(path => foundEggPages.add(path))
        dinoEggsFound.value = foundEggPages.size
        refreshDinosaurEgg()
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
        window.clearTimeout(floodImpactCleanupTimer)
        window.clearTimeout(dinosaurAudioCleanupTimer)
        window.clearTimeout(dinosaurLockdownTimer)
        window.clearTimeout(dinosaurToastTimer)
        window.clearInterval(dinosaurCountdownTimer)
        void sunExplosionAudio?.close()
        void floodImpactAudio?.close()
        void dinosaurAudio?.close()
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
          h('div', { class: 'lumen-day-night-fade', 'aria-hidden': 'true' }),
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
            h('div', { class: 'lumen-track-visuals', 'aria-hidden': 'true' }, [
              h('div', { class: 'lumen-track-horizon' }, [
                h('div', { class: 'lumen-track-illustrations' }, [
                  ...Array.from({ length: 5 }, (_, index) =>
                    h('svg', { class: `lumen-track-pine lumen-track-pine-${index + 1}`, viewBox: '0 0 180 360', focusable: 'false' }, [
                      h('use', { href: '/assets/soundtrack-sprites.svg#pine' }),
                    ]),
                  ),
                  h('svg', { class: 'lumen-track-mountain-art', viewBox: '0 0 640 300', focusable: 'false' }, [
                    h('use', { href: '/assets/soundtrack-sprites.svg#mountain' }),
                  ]),
                  ...Array.from({ length: 3 }, (_, index) =>
                    h('svg', { class: `lumen-track-wave-art lumen-track-wave-art-${index + 1}`, viewBox: '0 0 600 180', focusable: 'false' }, [
                      h('use', { href: '/assets/soundtrack-sprites.svg#wave' }),
                    ]),
                  ),
                  ...Array.from({ length: 3 }, (_, index) =>
                    h('svg', { class: `lumen-track-flare lumen-track-flare-${index + 1}`, viewBox: '0 0 180 300', focusable: 'false' }, [
                      h('use', { href: '/assets/soundtrack-sprites.svg#flare' }),
                    ]),
                  ),
                  ...Array.from({ length: 4 }, (_, index) =>
                    h('svg', { class: `lumen-track-orb lumen-track-orb-${index + 1}`, viewBox: '0 0 140 140', focusable: 'false' }, [
                      h('use', { href: '/assets/soundtrack-sprites.svg#chrome-orb' }),
                    ]),
                  ),
                  ...Array.from({ length: 4 }, (_, index) =>
                    h('svg', { class: `lumen-track-crystal lumen-track-crystal-${index + 1}`, viewBox: '0 0 180 260', focusable: 'false' }, [
                      h('use', { href: '/assets/soundtrack-sprites.svg#crystal' }),
                    ]),
                  ),
                  ...Array.from({ length: 6 }, (_, index) =>
                    h('svg', { class: `lumen-track-firefly-art lumen-track-firefly-art-${index + 1}`, viewBox: '0 0 100 100', focusable: 'false' }, [
                      h('use', { href: '/assets/soundtrack-sprites.svg#firefly' }),
                    ]),
                  ),
                  h('svg', { class: 'lumen-track-coast-drive', viewBox: '0 0 1440 900', focusable: 'false' }, [
                    h('use', { href: '/assets/soundtrack-sprites.svg#coast-drive' }),
                  ]),
                ]),
                h('svg', { class: 'lumen-track-sun', viewBox: '0 0 128 128', focusable: 'false' }, [
                  h('use', { href: '/assets/soundtrack-sprites.svg#sun' }),
                ]),
                h('svg', { class: 'lumen-track-moon', viewBox: '0 0 128 128', focusable: 'false' }, [
                  h('use', { href: '/assets/soundtrack-sprites.svg#moon' }),
                ]),
                ...Array.from({ length: 3 }, (_, index) =>
                  h('svg', { class: `lumen-track-cloud lumen-track-cloud-${index + 1}`, viewBox: '0 0 220 120', focusable: 'false' }, [
                    h('use', { href: '/assets/soundtrack-sprites.svg#cloud' }),
                  ]),
                ),
                ...Array.from({ length: 8 }, (_, index) =>
                  h('span', { class: `lumen-track-star lumen-track-star-${index + 1}` }),
                ),
                ...Array.from({ length: 6 }, (_, index) =>
                  h('svg', { class: `lumen-track-lantern lumen-track-lantern-${index + 1}`, viewBox: '0 0 96 128', focusable: 'false' }, [
                    h('use', { href: '/assets/soundtrack-sprites.svg#lantern' }),
                  ]),
                ),
              ]),
              ...Array.from({ length: 3 }, (_, index) =>
                h('span', { class: `lumen-track-aurora lumen-track-aurora-${index + 1}` }),
              ),
              ...Array.from({ length: 14 }, (_, index) =>
                h('span', { class: `lumen-track-particle lumen-track-particle-${index + 1}` }),
              ),
            ]),
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
            ...Array.from({ length: 7 }, (_, index) =>
              h('span', { class: `lumen-flood-fish lumen-flood-fish-${index + 1}` }, '🐟'),
            ),
            ...Array.from({ length: 3 }, (_, index) =>
              h('span', { class: `lumen-flood-shark lumen-flood-shark-${index + 1}` }, '🦈'),
            ),
          ]),
          dinoEggPath.value && dinoEggPath.value === currentPath.value
            ? h('button', {
              class: 'lumen-dino-egg',
              type: 'button',
              'aria-label': 'A tiny dinosaur egg is hidden here. Click to hatch it.',
              title: 'Something is moving inside...',
              style: {
                left: dinoEggPosition.value.left,
                top: dinoEggPosition.value.top,
              },
              onClick: discoverDinosaurEgg,
            }, [
              h('svg', {
                viewBox: '0 0 72 88',
                'aria-hidden': 'true',
                focusable: 'false',
              }, [h('use', { href: '/assets/dinosaur-sprites.svg#egg' })]),
            ])
            : null,
          h('div', {
            class: 'lumen-dino-toast',
            role: 'status',
            'aria-live': 'polite',
          }, dinoToast.value),
          h('div', {
            class: 'lumen-dino-countdown-overlay',
            role: 'status',
            'aria-live': 'assertive',
          }, [
            h('span', {}, 'ANCIENT SIGNAL DETECTED'),
            h('strong', {}, String(dinoCountdown.value)),
            h('span', {}, 'The ground is rumbling...'),
          ]),
          h('div', { class: 'lumen-dino-lockdown-overlay', 'aria-hidden': 'true' }, [
            h('span', { class: 'lumen-dino-lockdown-label' }, 'EMERGENCY LOCKDOWN'),
            dinosaurSprite('trex', 'lumen-dino-trex'),
            h('span', { class: 'lumen-dino-lockdown-copy' }, 'Please remain calm. The T. rex is very friendly. Probably.'),
          ]),
          h('div', { class: 'lumen-dino-prehistoric' }, [
            h('div', { class: 'lumen-dino-skyline', 'aria-hidden': 'true' }),
            h('div', { class: 'lumen-dino-volcano', 'aria-hidden': 'true' }, [
              h('svg', { viewBox: '0 0 180 140', focusable: 'false' }, [
                h('use', { href: '/assets/dinosaur-sprites.svg#volcano' }),
              ]),
            ]),
            h('div', { class: 'lumen-dino-landscape', 'aria-hidden': 'true' }),
            ...([
              ['longneck', 'lumen-dino-roamer-1'],
              ['trex', 'lumen-dino-roamer-2'],
              ['triceratops', 'lumen-dino-roamer-3'],
              ['longneck', 'lumen-dino-roamer-4'],
              ['triceratops', 'lumen-dino-roamer-5'],
              ['trex', 'lumen-dino-roamer-6'],
            ] as const).map(([kind, className], index) =>
              dinosaurSprite(kind, `lumen-dino-roamer ${className} lumen-dino-roamer-walker-${index + 1}`),
            ),
            h('a', {
              class: 'lumen-dino-era-label',
              href: '/extinction',
              'aria-label': 'Open the secret extinction discoverer count',
              title: 'See how many explorers found the eggs',
            }, 'WELCOME TO THE CRETACEOUS · OPEN THE FOSSIL COUNT'),
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
        'nav-bar-content-after': () => h('div', { class: 'lumen-nav-actions' }, [
          h('button', {
            class: 'lumen-report-button',
            type: 'button',
            'aria-label': 'Report a plugin bug',
            onClick: () => window.dispatchEvent(new Event('lumen-open-bug-report')),
          }, [
            h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, [
              h('path', { d: 'M12 8v9M8.5 10 5 7.5M15.5 10 19 7.5M8 13H4.5M16 13h3.5M9 5.5 7.5 3M15 5.5 16.5 3M8 17l-2 2M16 17l2 2' }),
              h('path', { d: 'M8 11a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0zM10 6h4' }),
            ]),
            h('span', 'Report a bug'),
          ]),
          h('div', { class: 'lumen-history-controls' }, [
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
        ]),
        'layout-bottom': () => h(DocsAssistant),
      })
    },
  }),
}
