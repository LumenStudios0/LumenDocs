<script setup lang="ts">
import { h, computed, ref, watch, type VNodeChild } from 'vue'
import { parseRichText, safeUrl, type InlineNode } from './rich-text.mjs'
const props = defineProps<{ text: string; imageUrl?: string | null }>()
const blocks = computed(() => parseRichText(props.text))
const image = computed(() => safeUrl(props.imageUrl || '', true))
const imageFailed = ref(false)
watch(() => props.imageUrl, () => { imageFailed.value = false })
function inline(nodes: InlineNode[]): VNodeChild[] {
  return nodes.map(node => {
    if (node.type === 'text') return node.text
    if (node.type === 'code') return h('code', node.text)
    const children = inline(node.children)
    if (node.type === 'link') return h('a', { href: node.url, target: '_blank', rel: 'noopener noreferrer' }, children)
    if (node.type === 'color') return h('span', { class: `rich-${node.color}` }, children)
    return h(({ strong: 'strong', em: 'em', strike: 'del' })[node.type], children)
  })
}
const RenderBlocks = () => blocks.value.map(block => {
  if (block.type === 'break') return h('br')
  if (block.type === 'pre') return h('pre', [h('code', block.text)])
  if (block.type === 'list') return h(block.ordered ? 'ol' : 'ul', block.items.map(item => h('li', inline(item))))
  return h(block.type === 'heading' ? `h${block.level + 2}` : 'p', inline(block.children))
})
</script>
<template><div class="rich-content"><RenderBlocks /><img v-if="image && !imageFailed" :src="image" alt="Attached announcement image" loading="lazy" referrerpolicy="no-referrer" @error="imageFailed = true"><p v-else-if="imageUrl" class="website-note">Image unavailable: {{ image ? 'could not load image' : 'invalid HTTPS URL' }}.</p></div></template>
<style scoped>
.rich-content{overflow-wrap:anywhere}.rich-content :deep(p){margin:.4em 0;white-space:pre-wrap}.rich-content :deep(pre){overflow:auto}.rich-content img{display:block;max-width:100%;max-height:420px;object-fit:contain;border-radius:12px;margin:1rem 0}.rich-content :deep(.rich-purple){color:#a879ff}.rich-content :deep(.rich-red){color:#ed6572}.rich-content :deep(.rich-green){color:#55b980}.rich-content :deep(.rich-blue){color:#579be8}.rich-content :deep(.rich-orange){color:#dd973e}.rich-content :deep(.rich-pink){color:#e678c4}
.rich-content :deep(h3){font-size:1.55rem}.rich-content :deep(h4){font-size:1.35rem}.rich-content :deep(h5){font-size:1.15rem}.rich-content :deep(h3),.rich-content :deep(h4),.rich-content :deep(h5){line-height:1.35;margin:1rem 0 .5rem;font-weight:700}
</style>
