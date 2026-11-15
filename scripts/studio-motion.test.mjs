import test from 'node:test'
import assert from 'node:assert/strict'
import { createStudioMotion } from '../docs/.vitepress/theme/motion.ts'

function fixture(t) {
  const frames = new Map(), observers = [], listeners = new Map(), mediaListeners = new Map()
  const elements = [], sceneElements = []
  let nextFrame = 0
  class Surface {
    constructor() {
      this.classes = new Set()
      this.properties = new Map()
      this.animations = []
      this.classList = {
        add: value => this.classes.add(value),
        remove: value => this.classes.delete(value),
        toggle: (value, enabled) => enabled ? this.classes.add(value) : this.classes.delete(value),
      }
      this.style = { setProperty: (key, value) => this.properties.set(key, value), removeProperty: key => this.properties.delete(key) }
    }
    matches(selector) { return selector === ':disabled' && this.disabled }
    closest(selector) { return this.classes.has(selector.slice(1)) ? this : null }
    getBoundingClientRect() { return { left: 10, top: 20 } }
    animate(keyframes, options) {
      const animation = { keyframes, options, playState: 'running', finished: new Promise(() => {}),
        cancel() { this.playState = 'idle' }, pause() { this.playState = 'paused' }, play() { this.playState = 'running' } }
      this.animations.push(animation)
      return animation
    }
  }
  class Observer {
    constructor(callback) { this.callback = callback; this.observed = new Set(); observers.push(this) }
    observe(element) { this.observed.add(element) }
    unobserve(element) { this.observed.delete(element) }
    disconnect() { this.observed.clear(); this.disconnected = true }
  }
  const preference = { matches: false, addEventListener: (type, listener) => mediaListeners.set(type, listener), removeEventListener: type => mediaListeners.delete(type) }
  const document = {
    hidden: false, documentElement: new Surface(), body: new Surface(),
    querySelector: () => null,
    querySelectorAll: selector => selector === '.lumen-motion-pending' ? elements.filter(element => element.classes.has('lumen-motion-pending'))
      : selector.startsWith('.launch-atmosphere') ? sceneElements : elements,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: type => listeners.delete(type),
  }
  const previousGlobals = new Map()
  for (const [name, value] of Object.entries({
    document, Element: Surface, matchMedia: () => preference, IntersectionObserver: Observer, MutationObserver: Observer,
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame },
    cancelAnimationFrame: id => frames.delete(id),
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name)
    previousGlobals.set(name, previous)
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  const surface = new Surface()
  elements.push(surface)
  sceneElements.push(new Surface())
  const motion = createStudioMotion()
  t.after(() => {
    motion.dispose()
    previousGlobals.forEach((previous, name) => previous ? Object.defineProperty(globalThis, name, previous) : Reflect.deleteProperty(globalThis, name))
  })
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()) }
  return { Surface, document, elements, surface, sceneElements, observers, preference, mediaListeners, listeners, motion, flush }
}

test('motion reveals content, pauses in hidden tabs, and cancels safely when reduced motion is enabled', t => {
  const f = fixture(t)
  assert.ok(f.surface.classes.has('lumen-motion-pending'))
  f.observers[0].callback([{ target: f.surface, isIntersecting: true }])
  assert.ok(!f.surface.classes.has('lumen-motion-pending'))
  const animation = f.surface.animations[0]
  assert.equal(animation.playState, 'running')
  f.document.hidden = true
  f.listeners.get('visibilitychange')()
  assert.equal(animation.playState, 'paused')
  assert.ok(f.document.documentElement.classes.has('lumen-motion-suspended'))
  f.document.hidden = false
  f.listeners.get('visibilitychange')()
  assert.equal(animation.playState, 'running')
  f.surface.classes.add('lumen-motion-pending')
  f.preference.matches = true
  f.mediaListeners.get('change')()
  assert.equal(animation.playState, 'idle')
  assert.ok(!f.surface.classes.has('lumen-motion-pending'))
  f.observers[0].callback([{ target: f.surface, isIntersecting: true }])
  assert.equal(f.surface.animations.length, 1)
  f.motion.dispose()
  assert.ok(f.observers.every(observer => observer.disconnected))
  assert.equal(f.listeners.size, 0)
})

test('new panels are observed, keyboard focus reveals them, and touch/disabled controls avoid pointer motion', t => {
  const f = fixture(t)
  const dynamic = new f.Surface()
  f.elements.push(dynamic)
  f.observers[2].callback([{ addedNodes: [dynamic] }])
  f.flush()
  assert.ok(f.observers[0].observed.has(dynamic))
  f.listeners.get('focusin')({ target: dynamic })
  assert.ok(!dynamic.classes.has('lumen-motion-pending'))
  assert.ok(!f.observers[0].observed.has(dynamic))
  f.observers[1].callback([{ target: f.sceneElements[0], isIntersecting: false }])
  assert.ok(f.sceneElements[0].classes.has('lumen-scene-paused'))
  f.listeners.get('pointermove')({ target: dynamic, pointerType: 'touch', clientX: 40, clientY: 60 })
  f.flush()
  assert.equal(dynamic.properties.size, 0)
  f.listeners.get('pointermove')({ target: dynamic, pointerType: 'mouse', clientX: 40, clientY: 60 })
  f.flush()
  assert.equal(dynamic.properties.get('--pointer-x'), '30px')
  dynamic.disabled = true
  f.listeners.get('pointerdown')({ target: dynamic, button: 0 })
  assert.equal(dynamic.animations.length, 0)
  dynamic.disabled = false
  f.listeners.get('pointerdown')({ target: dynamic, button: 0 })
  assert.equal(dynamic.animations.length, 1)
  f.motion.dispose()
  assert.equal(dynamic.properties.size, 0)
})
