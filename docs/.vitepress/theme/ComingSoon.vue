<script setup lang="ts">
import { onMounted, ref } from 'vue'

const messages = [
  'Wrong page. The right one is still being mined.',
  'These docs haven’t respawned yet.',
  'Nothing here but a suspiciously empty chest.',
  'Looks like you followed a trail into unloaded chunks.',
  '404: This page wandered off to punch trees.',
  'The villager says “hmm” and refuses to elaborate.',
  'Even /locate couldn’t find this page.',
  'We sent a creeper to fetch it. It hasn’t come back.',
  'This page is at spawn, but we forgot to set the coordinates.',
  'No loot in this chest. Try the plugin catalog instead.',
  'Someone used /kill @e[type=page] by mistake.',
  'The End portal is open, but this page forgot its eyes.',
  'Page not found. Maybe it rage-quit after a PvP duel.',
  'Loading... just kidding. It’s not written yet.',
  'Try again after the next server restart.'
]

const product = ref('That plugin')
const message = ref(messages[0])

onMounted(() => {
  const requestedProduct = new URLSearchParams(window.location.search).get('product')
  const availableProducts = ['LumenTeam', 'LumenIntellegance', 'Sentinel']

  if (requestedProduct && availableProducts.includes(requestedProduct)) {
    product.value = requestedProduct
  }

  message.value = messages[Math.floor(Math.random() * messages.length)] || messages[0]
})
</script>

<template>
  <div class="soon-page">
    <p class="soon-eyebrow">404 · PAGE NOT FOUND</p>
    <h1>Wrong turn, adventurer.</h1>
    <p class="soon-intro"><strong>{{ product }}</strong> is coming soon. This page got here before its documentation did.</p>
    <div class="soon-message" aria-live="polite">{{ message }}</div>
    <a class="soon-back" href="/plugins/">Back to the plugin catalog <span aria-hidden="true">↗</span></a>
  </div>
</template>
