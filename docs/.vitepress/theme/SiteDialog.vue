<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'
import { siteDialogKey } from './site-dialog'

const service = inject(siteDialogKey)
if (!service) throw new Error('Website dialogs are not configured.')
const { current, close } = service
const route = useRoute()
const dialog = ref<HTMLDialogElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)
const confirmation = ref('')
const mayConfirm = computed(() => !current.value?.requiredText || confirmation.value === current.value.requiredText)
function accept() { if (mayConfirm.value) close(true) }
function cancel() { close() }
function sessionChanged(event: StorageEvent) { if (event.key === null || event.key === 'lumen-discord-session') cancel() }
watch(() => route.path, cancel)
watch(current, async request => {
  confirmation.value = ''
  if (!request) {
    dialog.value?.close()
    document.documentElement.classList.remove('lumen-site-dialog-open')
    return
  }
  await nextTick()
  if (current.value !== request || !dialog.value) return
  if (!dialog.value.open) dialog.value.showModal()
  document.documentElement.classList.add('lumen-site-dialog-open')
  if (request.requiredText) input.value?.focus()
  else cancelButton.value?.focus()
})
onMounted(() => {
  window.addEventListener('lumen-discord-user', cancel)
  window.addEventListener('storage', sessionChanged)
})
onUnmounted(() => {
  cancel()
  document.documentElement.classList.remove('lumen-site-dialog-open')
  window.removeEventListener('lumen-discord-user', cancel)
  window.removeEventListener('storage', sessionChanged)
})
</script>

<template>
  <ClientOnly>
  <Teleport to="body">
    <dialog ref="dialog" class="lumen-site-dialog" aria-labelledby="lumen-dialog-title" aria-describedby="lumen-dialog-message" @cancel.prevent="cancel">
      <form v-if="current" @submit.prevent="accept">
        <p class="dialog-eyebrow">LUMEN STUDIOS</p>
        <h2 id="lumen-dialog-title">{{ current.title || 'Confirm action' }}</h2>
        <p id="lumen-dialog-message">{{ current.message }}</p>
        <label v-if="current.requiredText" class="dialog-confirmation"><span>Type <code>{{ current.requiredText }}</code> to confirm</span>
          <input ref="input" v-model="confirmation" :maxlength="current.requiredText.length" autocomplete="off" spellcheck="false">
        </label>
        <div class="dialog-actions">
          <button ref="cancelButton" type="button" @click="cancel">Cancel</button>
          <button class="dialog-primary" :class="{ 'dialog-danger': current.danger }" type="submit" :disabled="!mayConfirm">{{ current.confirmText || 'Continue' }}</button>
        </div>
      </form>
    </dialog>
  </Teleport>
  </ClientOnly>
</template>

<style scoped>
:global(html.lumen-site-dialog-open) { overflow: hidden; }
.lumen-site-dialog { position: fixed; inset: 0; width: min(460px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); margin: auto; padding: 28px; overflow-y: auto; border: 1px solid var(--vp-c-brand-1); border-radius: 18px; background: var(--vp-c-bg); color: var(--vp-c-text-1); box-shadow: 0 24px 80px rgb(0 0 0 / 40%); }
.lumen-site-dialog::backdrop { background: rgb(9 5 20 / 72%); backdrop-filter: blur(5px); }
.dialog-eyebrow { margin: 0 0 10px; color: var(--vp-c-brand-1); font-size: 10px; font-weight: 700; letter-spacing: .16em; }
h2 { margin: 0 0 14px; font-size: 23px; font-weight: 650; line-height: 1.3; }
#lumen-dialog-message { margin: 0; color: var(--vp-c-text-2); font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.dialog-confirmation { display: grid; gap: 10px; margin-top: 20px; font-size: 13px; overflow-wrap: anywhere; }
.dialog-confirmation code { color: var(--vp-c-brand-1); }
input { width: 100%; padding: 10px 12px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg-soft); color: var(--vp-c-text-1); font: inherit; }
.dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 24px; }
button { min-height: 40px; padding: 9px 16px; border: 1px solid var(--vp-c-divider); border-radius: 9px; color: var(--vp-c-text-1); font-size: 13px; font-weight: 600; cursor: pointer; }
.dialog-primary { border-color: var(--vp-button-brand-bg); background: var(--vp-button-brand-bg); color: var(--vp-button-brand-text); }
.dialog-danger { border-color: var(--vp-c-danger-1); background: var(--vp-c-danger-soft); color: var(--vp-c-danger-1); }
button:disabled { opacity: .45; cursor: not-allowed; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 3px; }
@media (max-width: 400px) { .lumen-site-dialog { padding: 22px; } .dialog-actions button { flex: 1; } }
</style>
