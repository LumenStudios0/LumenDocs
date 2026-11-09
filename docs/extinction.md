---
title: The Extinction Event
description: A tiny field report from the dinosaurs who found their way back.
---

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const discoverers = ref<number | null>(null)
const counterMessage = ref('Asking the fossils...')
const endpoint = import.meta.env.VITE_DINO_DISCOVERIES_ENDPOINT

onMounted(async () => {
  if (!endpoint) {
    counterMessage.value = 'The global explorer counter has not been connected yet.'
    return
  }

  try {
    const response = await fetch(endpoint)
    if (!response.ok) throw new Error(`Counter returned HTTP ${response.status}`)
    const result = await response.json() as { count?: unknown }
    if (typeof result.count !== 'number' || !Number.isSafeInteger(result.count) || result.count < 0) {
      throw new Error('Counter returned an invalid total')
    }
    discoverers.value = result.count
    counterMessage.value = 'unique browsers have uncovered all three eggs'
  } catch (error) {
    console.error('Unable to load dinosaur discoverer total:', error)
    counterMessage.value = 'The global explorer counter is temporarily unavailable.'
  }
})
</script>

# 🦖 The Extinction Event

The old web has gone extinct. The dinosaurs are very pleased with themselves.

<div class="dino-extinction-card">
  <div class="dino-extinction-herd" aria-hidden="true">🦕 🦖 🦕 🦖 🦕</div>
  <strong class="dino-extinction-count">{{ discoverers === null ? '???' : discoverers.toLocaleString() }}</strong>
  <span class="dino-extinction-caption">{{ counterMessage }}</span>
  <p class="dino-extinction-carriers" aria-hidden="true">🦖 <span>{{ discoverers === null ? '•••' : discoverers.toLocaleString() }}</span> 🦕</p>
</div>

::: tip Field note
The total counts unique browser IDs that completed the egg hunt, not verified individual people. The anonymous ID is stored on the visitor's device; the counter stores only its one-way hash.
:::

<p><a href="/">Escape back to the modern world (the dinosaurs promise to behave).</a></p>
