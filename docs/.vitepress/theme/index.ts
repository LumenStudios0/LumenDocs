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
      const minecraftToast = ref('')
      let minecraftToastTimer: number | undefined
      let phraseBuffer = ''
      let konamiIndex = 0
      const konamiCode = [
        'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
        'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a',
      ]

      const toggleMinecraftMode = () => {
        const root = document.documentElement
        const enabled = !root.classList.contains('lumen-minecraft')
        root.classList.toggle('lumen-minecraft', enabled)
        minecraftToast.value = enabled ? 'Minecraft mode enabled' : 'Minecraft mode disabled'
        window.clearTimeout(minecraftToastTimer)
        minecraftToastTimer = window.setTimeout(() => { minecraftToast.value = '' }, 2400)
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
          if (phraseBuffer === 'minecraft') {
            phraseBuffer = ''
            konamiIndex = 0
            toggleMinecraftMode()
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

      const handleSkyClick = () => {
        const root = document.documentElement
        if (root.classList.contains('lumen-sun-exploded') || root.classList.contains('lumen-moon-flooded')) return

        if (root.classList.contains('dark')) {
          moonClicks += 1
          if (moonClicks === 10) root.classList.add('lumen-moon-flooded')
        } else {
          sunClicks += 1
          if (sunClicks === 10) root.classList.add('lumen-sun-exploded')
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
        addInlineCopyButtons()
        scheduleAmbientWeather()
      })
      onUnmounted(() => {
        router.onAfterRouteChange = previousRouteChanged
        window.removeEventListener('popstate', handlePopState)
        window.removeEventListener('keydown', handleSecretKeys)
        window.clearTimeout(ambientWeatherTimer)
        window.clearTimeout(minecraftToastTimer)
        ambientWeatherTimers.forEach(timer => window.clearTimeout(timer))
        document.documentElement.classList.remove(
          'lumen-weather-meteors',
          'lumen-weather-rain',
          'lumen-weather-balloon-event',
        )
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
          h('div', { class: 'lumen-weather-sky', 'aria-hidden': 'true' }, [
            ...Array.from({ length: 12 }, (_, index) =>
              h('span', { class: `lumen-event-meteor lumen-event-meteor-${index + 1}` }),
            ),
            ...Array.from({ length: 3 }, (_, index) =>
              h('span', { class: `lumen-weather-cloud lumen-weather-cloud-${index + 1}` }),
            ),
            ...Array.from({ length: 32 }, (_, index) =>
              h('span', { class: `lumen-rain-drop lumen-rain-drop-${index + 1}` }),
            ),
            h('span', { class: 'lumen-weather-balloon' }, [
              h('span', { class: 'lumen-balloon-string' }),
            ]),
            ...Array.from({ length: 8 }, (_, index) =>
              h('span', { class: `lumen-firefly lumen-firefly-${index + 1}` }),
            ),
            h('span', { class: 'lumen-tide-wave lumen-tide-wave-1' }),
            h('span', { class: 'lumen-tide-wave lumen-tide-wave-2' }),
          ]),
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
          h('div', { class: 'lumen-minecraft-toast', role: 'status', 'aria-live': 'polite' }, minecraftToast.value),
          h('button', {
            class: 'lumen-pixel-moon',
            type: 'button',
            'aria-label': 'Sun or moon: click 10 times for a surprise',
            title: 'Click 10 times for a surprise',
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
