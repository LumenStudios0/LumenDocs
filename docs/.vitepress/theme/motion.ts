const surfaces = '.VPDoc .vp-doc > div > :is(h1,h2,h3), .lumen-card, .home-entry-card, .home-reveal, .home-step, .staff-profile, .staff-panel, .staff-customers, .ops .panel, .knowledge-hero, .knowledge-article, .knowledge-launchpad a, .customer-hero, .customer-destinations > a, .license-health, .health-metrics article, .server-workspace, .server-list article, .account-product-card, .website-panel'
const scenes = '.launch-atmosphere, .engine-stage, .deploy-scene, .home-feature-card, .home-license-art, .home-portal-visual, .home-journey, .home-final-glow, .knowledge-hero, .customer-hero, .loyalty-badge'
const interactive = 'a.home-button, .home-entry-card, .home-feature-card, .home-step, .lumen-card, .VPButton, .staff-actions button, .staff-navigation button, .ops button, .knowledge-launchpad a, .customer-destinations > a, .account-product-card, .website-primary'

export function createStudioMotion() {
  const preference = matchMedia('(prefers-reduced-motion: reduce)')
  const observed = new WeakSet<Element>()
  const animations = new Set<Animation>()
  const presses = new WeakMap<Element, Animation>()
  let frame = 0
  let pointerFrame = 0
  let pointerTarget: HTMLElement | null = null
  let disposed = false

  const track = (animation: Animation) => {
    animations.add(animation)
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation))
  }
  const reveal = new IntersectionObserver(entries => {
    let index = 0
    entries.forEach(entry => {
      if (!entry.isIntersecting) return
      const element = entry.target
      reveal.unobserve(element)
      element.classList.remove('lumen-motion-pending')
      if (preference.matches || document.hidden) return
      const heading = element.matches('h1,h2,h3')
      track(element.animate([
        { opacity: 0, translate: heading ? '0 32px' : '0 40px', filter: 'blur(4px)', clipPath: heading ? 'inset(0 0 100% 0)' : 'none' },
        { opacity: 1, translate: '0 0', filter: 'blur(0)', clipPath: heading ? 'inset(0)' : 'none' },
      ], { duration: heading ? 850 : 700, delay: Math.min(index++ * 65, 260), easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }))
    })
  }, { threshold: 0, rootMargin: '0px 0px -20px 0px' })
  const sceneObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.target.classList.toggle('lumen-scene-paused', !entry.isIntersecting))
  }, { rootMargin: '100px' })

  const refresh = () => {
    if (disposed) return
    document.querySelectorAll(surfaces).forEach(element => {
      if (observed.has(element)) return
      observed.add(element)
      if (!preference.matches && !document.hidden) {
        element.classList.add('lumen-motion-pending')
        reveal.observe(element)
      }
    })
    document.querySelectorAll(scenes).forEach(element => sceneObserver.observe(element))
    document.querySelectorAll(interactive).forEach(element => element.classList.add('lumen-interactive'))
  }
  const scheduleRefresh = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(refresh)
  }
  const mutations = new MutationObserver(records => {
    if (records.some(record => record.addedNodes.length)) scheduleRefresh()
  })
  const sync = () => {
    document.documentElement.classList.toggle('lumen-motion-suspended', document.hidden)
    if (preference.matches) {
      animations.forEach(animation => animation.cancel())
      document.querySelectorAll('.lumen-motion-pending').forEach(element => element.classList.remove('lumen-motion-pending'))
      reveal.disconnect()
    } else {
      animations.forEach(animation => document.hidden ? animation.pause() : animation.play())
    }
    resetPointer()
  }
  function resetPointer() {
    cancelAnimationFrame(pointerFrame)
    pointerTarget?.style.removeProperty('--pointer-x')
    pointerTarget?.style.removeProperty('--pointer-y')
    pointerTarget = null
  }
  const move = (event: PointerEvent) => {
    if (preference.matches || document.hidden || event.pointerType === 'touch') return
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('.lumen-interactive') : null
    if (target !== pointerTarget) resetPointer()
    pointerTarget = target
    if (!target) return
    const bounds = target.getBoundingClientRect()
    cancelAnimationFrame(pointerFrame)
    pointerFrame = requestAnimationFrame(() => {
      target.style.setProperty('--pointer-x', `${event.clientX - bounds.left}px`)
      target.style.setProperty('--pointer-y', `${event.clientY - bounds.top}px`)
    })
  }
  const press = (event: PointerEvent) => {
    if (preference.matches || event.button !== 0) return
    const target = event.target instanceof Element ? event.target.closest('.lumen-interactive') : null
    if (!target || target.matches(':disabled')) return
    presses.get(target)?.cancel()
    const animation = target.animate([{ scale: '1' }, { scale: '.97', offset: .3 }, { scale: '1' }],
      { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' })
    presses.set(target, animation)
    track(animation)
  }
  const focus = (event: FocusEvent) => {
    const target = event.target instanceof Element ? event.target.closest('.lumen-motion-pending') : null
    if (!target) return
    reveal.unobserve(target)
    target.classList.remove('lumen-motion-pending')
  }
  mutations.observe(document.querySelector('.VPContent') ?? document.body, { childList: true, subtree: true })
  document.addEventListener('pointermove', move, { passive: true })
  document.addEventListener('pointerdown', press, { passive: true })
  document.addEventListener('pointerleave', resetPointer)
  document.addEventListener('focusin', focus)
  document.addEventListener('visibilitychange', sync)
  preference.addEventListener('change', sync)
  sync()
  refresh()
  return {
    track,
    refresh: scheduleRefresh,
    dispose() {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(frame)
      resetPointer()
      mutations.disconnect()
      reveal.disconnect()
      sceneObserver.disconnect()
      animations.forEach(animation => animation.cancel())
      document.querySelectorAll('.lumen-motion-pending').forEach(element => element.classList.remove('lumen-motion-pending'))
      document.documentElement.classList.remove('lumen-motion-suspended')
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerdown', press)
      document.removeEventListener('pointerleave', resetPointer)
      document.removeEventListener('focusin', focus)
      document.removeEventListener('visibilitychange', sync)
      preference.removeEventListener('change', sync)
    },
  }
}
