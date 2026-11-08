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

      const animatePage = () => {
        const nextPath = router.route.path
        if (nextPath === currentPath) return
        currentPath = nextPath

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

        document.querySelector('.VPContent')?.animate(
          [
            { opacity: 0.72, transform: 'translateY(6px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: 220, easing: 'ease-out' },
        )
      }

      router.onAfterRouteChange = animatePage
      onUnmounted(() => {
        router.onAfterRouteChange = previousRouteChanged
      })

      return () => h(DefaultTheme.Layout, null, {
        'layout-bottom': () => h(DocsAssistant),
      })
    },
  }),
}
