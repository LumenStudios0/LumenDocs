<script setup lang="ts">
import { ref } from 'vue'
import RichContent from './RichContent.vue'
const props = withDefaults(defineProps<{ modelValue: string; maxlength?: number; required?: boolean; rows?: number; disabled?: boolean; label?: string }>(), { maxlength: 4000, rows: 6 })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const input = ref<HTMLTextAreaElement | null>(null)
function wrap(before: string, after = before) {
  const el = input.value
  if (!el) return
  const start = el.selectionStart, end = el.selectionEnd
  const value = props.modelValue.slice(0, start) + before + (props.modelValue.slice(start, end) || 'text') + after + props.modelValue.slice(end)
  emit('update:modelValue', value.slice(0, props.maxlength))
  requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + before.length, start + before.length + (end - start || 4)) })
}
</script>
<template><div class="rich-editor"><span v-if="label">{{ label }}</span><div class="rich-toolbar" aria-label="Formatting"><button type="button" :disabled="disabled" @click="wrap('### ', '')">Heading</button><button type="button" :disabled="disabled" @click="wrap('**')"><strong>B</strong></button><button type="button" :disabled="disabled" @click="wrap('*')"><em>I</em></button><button type="button" :disabled="disabled" @click="wrap('~~')"><del>S</del></button><button type="button" :disabled="disabled" @click="wrap('`')">Code</button><button type="button" :disabled="disabled" @click="wrap('- ', '')">List</button><button type="button" :disabled="disabled" @click="wrap('[', '](https://)')">Link</button><button type="button" :disabled="disabled" @click="wrap('[color=purple]', '[/color]')">Purple</button></div><textarea ref="input" :value="modelValue" :maxlength="maxlength" :required="required" :disabled="disabled" :aria-label="label || undefined" :rows="rows" @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" /><p class="website-note">Discord-style #, ##, ### headings, **bold**, *italic*, ~~strike~~, code, links and lists. Colored words use the website extension [color=purple]text[/color]; Discord does not support arbitrary colored words.</p><details><summary>Preview</summary><RichContent :text="modelValue" /></details></div></template>
<style scoped>.rich-toolbar{display:flex;flex-wrap:wrap;gap:.35rem;margin:.5rem 0}.rich-toolbar button{padding:.3rem .6rem}.rich-editor textarea{width:100%}</style>
