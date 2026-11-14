import DefaultTheme from 'vitepress/theme'
import { h, computed, defineComponent, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useData, useRouter } from 'vitepress'
import AccountLicenseIps from './AccountLicenseIps.vue'
import AccountLicenseClaim from './AccountLicenseClaim.vue'
import AccountProductCatalog from './AccountProductCatalog.vue'
import AccountConnectedServers from './AccountConnectedServers.vue'
import AccountDashboard from './AccountDashboard.vue'
import AccountLicenseOverview from './AccountLicenseOverview.vue'
import AccountSettings from './AccountSettings.vue'
import AdminDashboard from './AdminDashboard.vue'
import DocsAssistant from './DocsAssistant.vue'
import HomeExperience from './HomeExperience.vue'
import CommunityWorkspace from './CommunityWorkspace.vue'
import CommunityForum from './CommunityForum.vue'
import CompatibilityChecker from './CompatibilityChecker.vue'
import ErrorGuides from './ErrorGuides.vue'
import DocBookmarks from './DocBookmarks.vue'
import './custom.css'
import './website-tools.css'

export default {
  ...DefaultTheme,
  enhanceApp({ app }) {
    app.component('AccountLicenseIps', AccountLicenseIps)
    app.component('AccountLicenseClaim', AccountLicenseClaim)
    app.component('AccountProductCatalog', AccountProductCatalog)
    app.component('AccountConnectedServers', AccountConnectedServers)
    app.component('AccountDashboard', AccountDashboard)
    app.component('AccountLicenseOverview', AccountLicenseOverview)
    app.component('AccountSettings', AccountSettings)
    app.component('AdminDashboard', AdminDashboard)
    app.component('HomeExperience', HomeExperience)
    app.component('CommunityWorkspace', CommunityWorkspace)
    app.component('CommunityForum', CommunityForum)
    app.component('CompatibilityChecker', CompatibilityChecker)
    app.component('ErrorGuides', ErrorGuides)
    app.component('DocBookmarks', DocBookmarks)
  },
  Layout: defineComponent({
    setup() {
      const router = useRouter()
      const { isDark, page } = useData()
      const previousRouteChanged = router.onAfterRouteChange
      const canGoBack = ref(false)
      const canGoForward = ref(false)
      const navMenuOpen = ref(false)
      const currentPath = ref(router.route.path)
      const workspace = computed(() => {
        if (/^\/admin(?:\/|$)/.test(currentPath.value)) return { name: 'Studio console', link: '/admin/', label: 'ADMINISTRATION' }
        if (/^\/account(?:\/|$)/.test(currentPath.value)) return { name: 'Customer portal', link: '/account/', label: 'YOUR WORKSPACE' }
        return { name: 'Documentation', link: '/docs/', label: 'THE LUMEN GUIDEBOOK' }
      })
      const isDocumentation = computed(() =>
        currentPath.value !== '/' && !/^\/(?:account|admin)(?:\/|$)/.test(currentPath.value),
      )
      const isOperations = computed(() => /^\/(?:account|admin)(?:\/|$)/.test(currentPath.value))
      let traversingHistory = false
      const topNavigationItems = [
        { text: 'Documentation', link: '/docs/', detail: 'Answers, without the digging.', icon: 'M4 3h12l4 4v14H4zM14 3v6h6M8 13h8M8 17h5' },
        { text: 'Plugin catalog', link: '/plugins/', detail: 'Find your next server upgrade.', icon: 'm12 3 9 5-9 5-9-5zM3 8v9l9 5 9-5V8M12 13v9' },
        { text: 'Customer portal', link: '/account/', detail: 'Your products. Your workspace.', icon: 'M3 4h18v16H3zM3 9h18M9 9v11' },
        { text: 'Getting started', link: '/getting-started/', detail: 'From download to first launch.', icon: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z' },
        { text: 'Support & requests', link: '/reports/', detail: 'Get a hand. Share an idea.', icon: 'M4 4h16v12H9l-5 5zM8 8h8M8 12h5' },
        { text: 'Release notes', link: '/changelogs/', detail: 'See what is new at Lumen.', icon: 'M12 8v5l3 2M4 6a9 9 0 1 1-1 9M3 3v5h5' },
        { text: 'Compatibility checker', link: '/getting-started/compatibility', detail: 'Check declared plugin requirements.', icon: 'm5 12 4 4L19 6' },
        { text: 'Service status', link: '/status', detail: 'Service health and maintenance.', icon: 'M3 12h4l3-7 4 14 3-7h4' },
      ]
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
      const defaultFavicon = '/assets/lumen-logo.png'
      const bananaFavicon = '/assets/banana-logo.svg'
      const modeToast = ref('')
      let modeToastTimer: number | undefined
      let phraseBuffer = ''
      let bananaModeEnabled = false
      const toggleBananaMode = () => {
        const root = document.documentElement
        const enabled = !root.classList.contains('lumen-banana')
        root.classList.toggle('lumen-banana', enabled)
        bananaModeEnabled = enabled
        updateFavicon(enabled)
        window.dispatchEvent(new CustomEvent('lumen-theme-mode-change'))
        modeToast.value = enabled ? '🍌 Banana mode! 🍌' : 'Banana mode off'
        window.clearTimeout(modeToastTimer)
        modeToastTimer = window.setTimeout(() => { modeToast.value = '' }, 2400)
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
        if (/^[a-z]$/.test(key)) {
          phraseBuffer = (phraseBuffer + key).slice(-'banana'.length)
          if (phraseBuffer.endsWith('banana')) {
            phraseBuffer = ''
            toggleBananaMode()
          }
        } else {
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

      const handleNavMenuKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && navMenuOpen.value) {
          navMenuOpen.value = false
          document.querySelector<HTMLButtonElement>('.lumen-nav-menu-button')?.focus()
        }
      }

      const handleNavMenuPointerDown = (event: PointerEvent) => {
        const target = event.target
        if (target instanceof Element && !target.closest('.lumen-nav-menu')) {
          navMenuOpen.value = false
        }
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
        navMenuOpen.value = false
        await previousRouteChanged?.(nextPath)
        await nextTick()
        currentPath.value = nextPath
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
        window.addEventListener('popstate', handlePopState)
        document.addEventListener('pointerdown', handleNavMenuPointerDown)
        window.addEventListener('keydown', handleNavMenuKeydown)
        window.addEventListener('keydown', handleSecretKeys)
        window.addEventListener('pointermove', handlePointerMove)
        addInlineCopyButtons()
        scheduleAmbientWeather()
      })
      onUnmounted(() => {
        router.onAfterRouteChange = previousRouteChanged
        window.removeEventListener('popstate', handlePopState)
        document.removeEventListener('pointerdown', handleNavMenuPointerDown)
        window.removeEventListener('keydown', handleNavMenuKeydown)
        window.removeEventListener('keydown', handleSecretKeys)
        window.removeEventListener('pointermove', handlePointerMove)
        window.clearTimeout(ambientWeatherTimer)
        window.clearTimeout(modeToastTimer)
        window.clearTimeout(balloonPopTimer)
        window.clearTimeout(sunExplosionCleanupTimer)
        window.clearTimeout(floodImpactCleanupTimer)
        void sunExplosionAudio?.close()
        void floodImpactAudio?.close()
        ambientWeatherTimers.forEach(timer => window.clearTimeout(timer))
        document.documentElement.classList.remove(
          'lumen-banana',
          'lumen-weather-meteors',
          'lumen-weather-rain',
          'lumen-weather-balloon-event',
          'lumen-balloon-popped',
        )
        updateFavicon(false)
      })

      return () => h(DefaultTheme.Layout, {
        class: ['studio-shell', isDocumentation.value && 'studio-docs-shell', isOperations.value && 'studio-operations-shell'],
      }, {
        'sidebar-nav-before': () => [
          h('button', {
            class: 'studio-sidebar-close',
            type: 'button',
            'aria-label': 'Close sidebar',
            // Use VitePress's close handler so scroll lock and focus are restored.
            onClick: () => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' })),
          }, '×'),
          h('a', { class: 'studio-workspace', href: workspace.value.link }, [
            h('span', { class: 'studio-workspace-logo', 'aria-hidden': 'true' }, 'L'),
            h('span', [
              h('small', workspace.value.label),
              h('strong', workspace.value.name),
            ]),
            h('span', { class: 'studio-workspace-chevron', 'aria-hidden': 'true' }, '↗'),
          ]),
          h('button', {
            class: 'studio-sidebar-search',
            type: 'button',
            onClick: () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })),
          }, [
            h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
              h('circle', { cx: 10, cy: 10, r: 6 }),
              h('path', { d: 'm15 15 5 5' }),
            ]),
            h('span', 'Find an answer'),
            h('kbd', '/'),
          ]),
          h('div', { class: 'studio-sidebar-label' }, 'WORKSPACE'),
        ],
        'sidebar-nav-after': () => h('a', { class: 'studio-sidebar-help', href: '/reports/' }, [
          h('span', { class: 'studio-sidebar-help-icon', 'aria-hidden': 'true' }, '?'),
          h('strong', 'A little help goes a long way.'),
          h('span', 'Questions, bugs, or a new idea?'),
          h('small', 'Talk to the studio →'),
        ]),
        'doc-before': () => isDocumentation.value && [
          h('nav', { class: 'studio-breadcrumbs', 'aria-label': 'Breadcrumb' }, [
          h('a', { href: '/' }, 'Lumen'),
          h('span', { 'aria-hidden': 'true' }, '/'),
          h('a', { href: '/docs/' }, 'Guidebook'),
          h('span', { 'aria-hidden': 'true' }, '/'),
          h('span', { 'aria-current': 'page' }, page.value.title),
          ]),
          currentPath.value !== '/bookmarks' && h(DocBookmarks),
        ],
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
            h('div', { class: 'lumen-track-visuals', 'aria-hidden': 'true' }, [
              h('div', { class: 'lumen-track-horizon' }, [
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
          h('div', { class: 'lumen-mode-toast', role: 'status', 'aria-live': 'polite' }, modeToast.value),
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
          h('div', { class: 'lumen-nav-menu' }, [
            h('button', {
              class: ['lumen-nav-menu-button', navMenuOpen.value && 'is-open'],
              type: 'button',
              'aria-label': navMenuOpen.value ? 'Close site navigation' : 'Open site navigation',
              'aria-expanded': String(navMenuOpen.value),
              'aria-controls': 'lumen-nav-menu-panel',
              onClick: () => { navMenuOpen.value = !navMenuOpen.value },
              onKeydown: async (event: KeyboardEvent) => {
                if (event.key !== 'ArrowDown') return
                event.preventDefault()
                navMenuOpen.value = true
                await nextTick()
                document.querySelector<HTMLAnchorElement>('#lumen-nav-menu-panel a')?.focus()
              },
            }, [
              h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
                h('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1.5 }),
                h('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1.5 }),
                h('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1.5 }),
                h('rect', { x: 14, y: 14, width: 7, height: 7, rx: 1.5 }),
              ]),
              h('span', { class: 'lumen-nav-menu-label' }, 'Explore'),
              h('span', { class: 'lumen-nav-menu-chevron', 'aria-hidden': 'true' }, '⌄'),
            ]),
            navMenuOpen.value && h('nav', {
              id: 'lumen-nav-menu-panel',
              class: 'lumen-nav-menu-panel',
              'aria-label': 'Main navigation',
            }, [
              h('div', { class: 'studio-menu-heading' }, [
                h('small', 'THE LUMEN WORKSPACE'),
                h('strong', 'Where would you like to go?'),
              ]),
              ...topNavigationItems.map((item, index) =>
                h('a', {
                  class: 'lumen-nav-menu-link',
                  href: item.link,
                  'aria-current': currentPath.value.startsWith(item.link) ? 'page' : undefined,
                  style: { '--menu-index': index },
                  onClick: () => { navMenuOpen.value = false },
                }, [
                  h('span', { class: 'studio-menu-icon', 'aria-hidden': 'true' }, [
                    h('svg', { viewBox: '0 0 24 24' }, [h('path', { d: item.icon })]),
                  ]),
                  h('span', { class: 'studio-menu-copy' }, [
                    h('strong', item.text),
                    h('small', item.detail),
                  ]),
                  h('span', { class: 'studio-menu-arrow', 'aria-hidden': 'true' }, '↗'),
                ]),
              ),
              h('div', { class: 'studio-menu-footer' }, [
                h('a', {
                  class: 'studio-menu-discord',
                  href: 'https://discord.gg/lumenstudios',
                  target: '_blank',
                  rel: 'noreferrer',
                  onClick: () => { navMenuOpen.value = false },
                }, 'Join the community ↗'),
                h('button', {
                  class: 'lumen-nav-menu-theme',
                  type: 'button',
                  'aria-label': isDark.value ? 'Switch to day mode' : 'Switch to night mode',
                  onClick: () => { isDark.value = !isDark.value },
                }, isDark.value ? '☀ Light mode' : '☾ Dark mode'),
              ]),
            ]),
          ]),
          h('div', { class: 'lumen-nav-report-group' }, [
            h('a', {
              class: 'lumen-report-button',
              href: '/reports/',
              'aria-label': 'Open reports to submit a bug, compatibility report, or feature request',
            }, [
              h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, [
                h('path', { d: 'M12 8v9M8.5 10 5 7.5M15.5 10 19 7.5M8 13H4.5M16 13h3.5M9 5.5 7.5 3M15 5.5 16.5 3M8 17l-2 2M16 17l2 2' }),
                h('path', { d: 'M8 11a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0zM10 6h4' }),
              ]),
              h('span', 'Submit a report'),
            ]),
            h('div', { id: 'lumen-nav-auth' }),
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
