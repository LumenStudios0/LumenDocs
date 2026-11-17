<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  options: { id: string; productId: string; name: string; reason: string }[]
  modelValue: string[]
  ownedProductIds: string[]
  disabled: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const search = ref('')
const registered = computed(() => props.options
  .filter((option, index, options) => options.findIndex(item => item.productId === option.productId) === index))
const available = computed(() => registered.value.filter(option => !option.reason))
const missing = computed(() => available.value.filter(option => !props.ownedProductIds.includes(option.productId)))
const filtered = computed(() => registered.value.filter(option => option.name.toLowerCase().includes(search.value.trim().toLowerCase())))
const canSelectVisible = computed(() => filtered.value.some(option => !option.reason && !props.modelValue.includes(option.productId)))

function toggle(productId: string) {
  if (props.disabled) return
  if (props.modelValue.includes(productId)) emit('update:modelValue', props.modelValue.filter(id => id !== productId))
  else if (available.value.some(option => option.productId === productId)) emit('update:modelValue', [...props.modelValue, productId])
}
function selectVisible() {
  if (props.disabled) return
  emit('update:modelValue', [...props.modelValue, ...filtered.value.filter(option => !option.reason && !props.modelValue.includes(option.productId))
    .map(option => option.productId)])
}
function clear() {
  if (!props.disabled) emit('update:modelValue', [])
}
function selectMissing() {
  if (!props.disabled) emit('update:modelValue', missing.value.map(option => option.productId))
}
</script>

<template>
  <div class="grant-picker">
    <div class="grant-picker-toolbar">
      <label class="grant-picker-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
        <input v-model="search" type="search" aria-label="Search plugins to grant" placeholder="Search plugins..." :disabled="disabled">
      </label>
      <span class="grant-picker-count" role="status" aria-live="polite">{{ modelValue.length }} selected</span>
    </div>
    <div class="grant-picker-tools">
      <span>{{ filtered.length }} {{ filtered.length === 1 ? 'plugin' : 'plugins' }}</span>
      <div>
        <button type="button" :disabled="disabled || !canSelectVisible" @click="selectVisible">Select {{ search.trim() ? 'matches' : 'all' }}</button>
        <button type="button" :disabled="disabled || !modelValue.length" @click="clear">Clear</button>
      </div>
    </div>
    <button class="grant-picker-missing" type="button" :disabled="disabled || !missing.length" @click="selectMissing">Only give missing plugins <span>{{ missing.length }}</span></button>
    <p v-if="!missing.length && available.length" class="grant-picker-hint" role="status">This customer already has active access to every available plugin.</p>
    <fieldset class="grant-picker-list" :disabled="disabled">
      <legend class="grant-picker-sr-only">Plugins to grant</legend>
      <label v-for="option in filtered" :key="option.productId" class="grant-picker-option" :class="{ 'is-selected': modelValue.includes(option.productId), 'is-unavailable': disabled || !!option.reason }">
        <span class="grant-picker-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.3l8 4.5" /></svg>
        </span>
        <span class="grant-picker-name">{{ option.name }}<small>{{ option.reason || (modelValue.includes(option.productId) ? 'Ready to grant' : 'Add to selection') }}</small></span>
        <input type="checkbox" :checked="modelValue.includes(option.productId)" :disabled="disabled || !!option.reason" @change="toggle(option.productId)">
      </label>
      <p v-if="!filtered.length" class="grant-picker-empty">{{ registered.length ? 'No plugins match your search.' : 'No plugins are registered yet. Add them in Plugins & products.' }}</p>
    </fieldset>
    <p class="grant-picker-hint">No selection limit. Existing active access is skipped, never shortened.</p>
  </div>
</template>

<style scoped>
.grant-picker { min-width: 0; margin-top: 20px; }
.grant-picker-toolbar, .grant-picker-tools, .grant-picker-tools > div { display: flex; align-items: center; gap: 10px; }
.grant-picker-toolbar { flex-wrap: wrap; }
.grant-picker-search { position: relative; flex: 1; min-width: 160px; }
.grant-picker-search > svg { position: absolute; top: 50%; left: 12px; width: 17px; height: 17px; transform: translateY(-50%); color: var(--vp-c-text-3); pointer-events: none; }
.grant-picker .grant-picker-search input { width: 100%; padding: 11px 12px 11px 38px; border: 1px solid var(--vp-c-divider); border-radius: 10px; background: var(--vp-c-bg); color: var(--vp-c-text-1); font: inherit; font-size: .78rem; }
.grant-picker-count { padding: 6px 9px; border: 1px solid var(--lumen-card-border); border-radius: 7px; background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); font-size: .68rem; font-weight: 650; white-space: nowrap; font-variant-numeric: tabular-nums; }
.grant-picker-tools { justify-content: space-between; flex-wrap: wrap; margin: 12px 0; color: var(--vp-c-text-2); font-size: .7rem; }
.grant-picker .grant-picker-tools button { padding: 4px 7px; border: 0; background: transparent; color: var(--vp-c-brand-1); font: inherit; font-weight: 600; cursor: pointer; }
.grant-picker button:disabled { opacity: .45; cursor: not-allowed; }
.grant-picker .grant-picker-missing { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; margin-bottom: 12px; padding: 11px 12px; border: 1px solid var(--lumen-card-border); border-radius: 9px; background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); font: inherit; font-size: .75rem; font-weight: 650; cursor: pointer; }
.grant-picker-missing span { padding: 2px 7px; border-radius: 5px; background: var(--vp-c-bg); font-size: .68rem; font-variant-numeric: tabular-nums; }
.grant-picker-list { display: grid; align-content: start; gap: 7px; min-width: 0; max-height: 340px; margin: 0; padding: 3px; overflow-y: auto; overscroll-behavior: contain; border: 0; scrollbar-width: thin; scrollbar-color: var(--vp-c-divider) transparent; }
.grant-picker-option { display: flex; align-items: center; gap: 12px; min-width: 0; margin: 0; padding: 12px; border: 1px solid var(--vp-c-divider); border-radius: 11px; background: var(--vp-c-bg); cursor: pointer; transition: background .16s, border-color .16s; }
.grant-picker-option:hover:not(.is-unavailable), .grant-picker-option.is-selected { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }
.grant-picker-option:focus-within { outline: 2px solid var(--vp-c-brand-1); outline-offset: 1px; }
.grant-picker-icon { display: grid; flex-shrink: 0; place-items: center; width: 34px; height: 34px; border: 1px solid var(--vp-c-divider); border-radius: 9px; color: var(--vp-c-text-2); }
.is-selected .grant-picker-icon { border-color: var(--lumen-card-border); color: var(--vp-c-brand-1); }
.grant-picker-icon svg { width: 21px; height: 21px; }
.grant-picker-name { flex: 1; min-width: 0; color: var(--vp-c-text-1); font-size: .8rem; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.grant-picker-name small { display: block; margin-top: 3px; color: var(--vp-c-text-2); font-size: .65rem; font-weight: 400; }
.grant-picker .grant-picker-option input[type=checkbox] { display: block; flex: 0 0 18px; width: 18px; height: 18px; min-width: 18px; margin: 0; padding: 0; accent-color: var(--vp-c-brand-1); cursor: inherit; }
.grant-picker-option.is-unavailable { opacity: .5; cursor: not-allowed; }
.grant-picker-hint, .grant-picker-empty { margin: 12px 0 0; color: var(--vp-c-text-2); font-size: .7rem; line-height: 1.6; }
.grant-picker-empty { padding: 24px 12px; border: 1px dashed var(--vp-c-divider); border-radius: 10px; text-align: center; }
.grant-picker-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.grant-picker :is(input, button):focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .grant-picker-option { transition: none; } }
</style>
