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
        addInlineCopyButtons()
      })
      onUnmounted(() => {
        router.onAfterRouteChange = previousRouteChanged
        window.removeEventListener('popstate', handlePopState)
      })

      return () => h(DefaultTheme.Layout, null, {
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
