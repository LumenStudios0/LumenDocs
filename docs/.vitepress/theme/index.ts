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
            { opacity: 0.35, filter: 'blur(2px)', transform: `translateX(${fromX}px) scale(0.99)` },
            { opacity: 1, filter: 'blur(0)', transform: 'translateX(0) scale(1)' },
          ],
          { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
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
