---
title: The Extinction Event
description: A tiny field report from the dinosaurs who found their way back.
---

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { defineComponent, h } from 'vue'

const DinosaurSprite = defineComponent({
  props: {
    variant: { type: String, required: true },
    label: { type: String, required: true },
    className: { type: String, default: '' },
  },
  setup(props) {
    return () => h('svg', {
      class: props.className,
      viewBox: '0 0 180 140',
      role: 'img',
      'aria-label': props.label,
      focusable: 'false',
    }, [
      h('use', { href: `/assets/dinosaur-sprites.svg#${props.variant}` }),
    ])
  },
})

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

# The Extinction Event

The old web has gone extinct. The dinosaurs are very pleased with themselves.

<div class="dino-extinction-card">
  <div class="dino-extinction-herd">
    <DinosaurSprite variant="longneck" label="Pip the long-necked dinosaur" class-name="dino-card-sprite dino-card-longneck" />
    <DinosaurSprite variant="trex" label="Mochi the T. rex" class-name="dino-card-sprite dino-card-trex" />
    <DinosaurSprite variant="triceratops" label="Pebble the triceratops" class-name="dino-card-sprite dino-card-triceratops" />
  </div>
  <strong class="dino-extinction-count">{{ discoverers === null ? '???' : discoverers.toLocaleString() }}</strong>
  <span class="dino-extinction-caption">{{ counterMessage }}</span>
  <div class="dino-extinction-carriers" aria-label="Dinosaur explorers carrying the discoverer total">
    <DinosaurSprite variant="trex" label="A small T. rex carrying the total" class-name="dino-carrier-sprite" />
    <span>{{ discoverers === null ? '•••' : discoverers.toLocaleString() }}</span>
    <DinosaurSprite variant="longneck" label="A long-necked dinosaur carrying the total" class-name="dino-carrier-sprite" />
  </div>
</div>

::: tip Field note
The total counts unique browser IDs that completed the egg hunt, not verified individual people. The anonymous ID is stored on the visitor's device; the counter stores only its one-way hash.
:::

<p><a href="/">Escape back to the modern world (the dinosaurs promise to behave).</a></p>
