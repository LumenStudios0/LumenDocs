import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import DocsAssistant from './DocsAssistant.vue'
import './custom.css'

export default {
  ...DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'layout-bottom': () => h(DocsAssistant),
  }),
}
