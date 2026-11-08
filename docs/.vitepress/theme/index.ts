import DefaultTheme from 'vitepress/theme'
import { h, defineComponent, onUnmounted } from 'vue'
import { useRouter } from 'vitepress'
import DocsAssistant from './DocsAssistant.vue'
import './custom.css'

export default {
  ...DefaultTheme,
  Layout: defineComponent({
    setup() {
      const router = useRouter()
      const previousRouteChanged = router.onAfterRouteChange
      let currentPath = router.route.path
      let slideFromLeft = true

      const animatePage = async (nextPath: string) => {
        await previousRouteChanged?.(nextPath)
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
      onUnmounted(() => { router.onAfterRouteChange = previousRouteChanged })

      return () => h(DefaultTheme.Layout, null, {
        'layout-bottom': () => h(DocsAssistant),
      })
    },
  }),
}
