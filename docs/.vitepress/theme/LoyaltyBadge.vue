<script setup lang="ts">
defineProps<{ tier: { id: string; name: string }; compact?: boolean; size?: 'small' | 'medium' | 'large'; iconOnly?: boolean }>()
</script>

<template>
  <span class="loyalty-badge" :class="{ 'loyalty-badge--compact': compact, 'loyalty-badge--icon-only': iconOnly }" :data-tier="tier.id" :data-size="compact ? undefined : size" :title="iconOnly ? tier.name : undefined" :aria-label="iconOnly ? tier.name : undefined" :role="iconOnly ? 'img' : undefined">
    <svg class="badge-effects" viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden="true">
      <path class="badge-circuit" d="M0 31H25L36 20H72M88 20H120L133 7H160" />
      <path class="badge-trace" d="M0 31H25L36 20H72M88 20H120L133 7H160" />
      <g v-if="['nova', 'elite', 'studio_lead', 'owner'].includes(tier.id)" class="badge-dust">
        <circle cx="9" cy="11" r="1" /><circle cx="42" cy="33" r="1" />
        <circle cx="108" cy="9" r="1.2" /><circle cx="148" cy="29" r="1" />
      </g>
      <path v-if="tier.id === 'elite' || tier.id === 'owner'" class="badge-flash" d="M138 5L140 11L146 13L140 15L138 21L136 15L130 13L136 11Z" />
    </svg>
    <span class="badge-sheen" aria-hidden="true" />
    <svg class="badge-art" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <g v-if="tier.id === 'spark'" class="spark-art">
        <path class="badge-facet" d="M18 3L7 18H14L12 29L25 13H18Z" />
        <path class="badge-ink spark-draw" d="M18 3L7 18H14L12 29L25 13H18Z" />
        <path class="spark-flicker" d="M3 7L5 9M26 24L29 26M26 5L28 3" />
      </g>
      <g v-else-if="tier.id === 'radiance'">
        <g class="radiance-rays">
          <path d="M16 2V6M16 26V30M2 16H6M26 16H30M6 6L9 9M23 23L26 26M6 26L9 23M23 9L26 6" />
        </g>
        <path class="badge-facet" d="M16 8L23 16L16 24L9 16Z" />
        <path class="badge-ink radiance-core" d="M16 8L23 16L16 24L9 16Z" />
        <circle class="radiance-orbit" cx="16" cy="16" r="11" />
      </g>
      <g v-else-if="tier.id === 'nova'">
        <ellipse class="nova-orbit" cx="16" cy="16" rx="14" ry="6" transform="rotate(-35 16 16)" />
        <path class="badge-facet nova-core" d="M16 5L19 12L27 16L19 19L16 27L13 19L5 16L13 12Z" />
        <path class="badge-ink nova-draw" d="M16 5L19 12L27 16L19 19L16 27L13 19L5 16L13 12Z" />
        <g class="nova-stars"><circle cx="5" cy="5" r="1.5" /><circle cx="28" cy="26" r="1.5" /></g>
      </g>
      <g v-else-if="tier.id === 'elite'">
        <path class="elite-halo" d="M4 17A12 12 0 1 1 28 17" />
        <path class="badge-facet" d="M5 12L11 17L16 7L21 17L27 12L24 25H8Z" />
        <path class="badge-ink elite-draw" d="M5 12L11 17L16 7L21 17L27 12L24 25H8Z" />
        <path class="elite-crystal" d="M16 14L20 20L16 25L12 20Z" />
        <path class="elite-sparks" d="M3 4V8M1 6H5M28 4V8M26 6H30" />
      </g>
      <g v-else-if="tier.id === 'jr_staff'">
        <path class="badge-facet" d="M16 4L25 8V16Q24 23 16 28Q8 23 7 16V8Z" />
        <path class="badge-ink" d="M16 4L25 8V16Q24 23 16 28Q8 23 7 16V8Z" />
        <path class="junior-sprout" d="M16 23V13M16 18Q10 18 10 12Q15 12 16 16M16 15Q17 10 22 10Q22 15 16 17" />
        <path class="spark-flicker" d="M3 8V12M1 10H5M27 21V25M25 23H29" />
      </g>
      <g v-else-if="tier.id === 'staff'">
        <path class="staff-beacon" d="M3 16H1M31 16H29M7 5L5 3M25 5L27 3M7 27L5 29M25 27L27 29" />
        <path class="badge-facet" d="M16 3L27 7V16Q26 25 16 29Q6 25 5 16V7Z" />
        <path class="badge-ink staff-shield" d="M16 3L27 7V16Q26 25 16 29Q6 25 5 16V7Z" />
        <path class="staff-check" d="M10 16L14 20L22 11" />
        <path class="staff-scan" d="M8 9H24" />
      </g>
      <g v-else-if="tier.id === 'sr_staff'">
        <circle class="senior-orbit" cx="16" cy="16" r="13" />
        <path class="badge-facet" d="M16 3L26 8V16Q25 24 16 29Q7 24 6 16V8Z" />
        <path class="badge-ink" d="M16 3L26 8V16Q25 24 16 29Q7 24 6 16V8Z" />
        <path class="senior-star" d="M16 8L18 13L23 15L18 17L16 23L14 17L9 15L14 13Z" />
        <path class="staff-scan" d="M9 10H23" />
      </g>
      <g v-else-if="tier.id === 'developer'">
        <path class="badge-facet" d="M16 2L29 9V23L16 30L3 23V9Z" />
        <path class="developer-frame" d="M16 2L29 9V23L16 30L3 23V9Z" />
        <path class="badge-ink developer-code" d="M11 11L6 16L11 21M21 11L26 16L21 21M18 9L14 23" />
        <path class="developer-signal" d="M3 9H9M23 23H29" />
        <circle class="developer-node" cx="16" cy="3" r="1.5" />
      </g>
      <g v-else-if="tier.id === 'studio_lead'">
        <circle class="lead-radar" cx="16" cy="16" r="13" />
        <path class="lead-axis" d="M16 1V6M16 26V31M1 16H6M26 16H31" />
        <g class="lead-compass">
          <path class="badge-facet" d="M16 5L21 16L16 27L11 16Z" />
          <path class="badge-ink" d="M16 5L21 16L16 27L11 16Z" />
          <path class="lead-needle" d="M16 5L21 16H16Z" />
        </g>
        <circle cx="16" cy="16" r="2" class="lead-center" />
      </g>
      <g v-else-if="tier.id === 'owner'">
        <g class="owner-orbit"><path d="M16 1L19 5L24 4L25 9L30 12L27 16L30 20L25 23L24 28L19 27L16 31L13 27L8 28L7 23L2 20L5 16L2 12L7 9L8 4L13 5Z" /></g>
        <path class="badge-facet" d="M16 6L25 16L16 26L7 16Z" />
        <path class="badge-ink owner-sigil" d="M16 6L25 16L16 26L7 16Z" />
        <path class="owner-star" d="M16 10L18 14L22 16L18 18L16 22L14 18L10 16L14 14Z" />
      </g>
      <g v-else-if="tier.id==='badge_starlit'">
        <circle class="radiance-orbit" cx="16" cy="16" r="13" /><path class="badge-facet nova-core" d="M16 3L20 12L30 16L20 20L16 29L12 20L2 16L12 12Z" /><path class="badge-ink" d="M16 3L20 12L30 16L20 20L16 29L12 20L2 16L12 12Z" />
      </g>
      <g v-else-if="tier.id==='badge_endwalker'">
        <ellipse class="nova-orbit" cx="16" cy="16" rx="13" ry="7" transform="rotate(-45 16 16)" /><path class="badge-facet" d="M16 2L25 12L20 26L12 30L7 16Z" /><path class="badge-ink" d="M16 2L25 12L20 26L12 30L7 16ZM16 2L14 17L20 26M7 16L14 17L25 12" />
      </g>
      <g v-else-if="tier.id==='badge_lumenheart'">
        <path class="badge-facet radiance-core" d="M16 28L4 16C-4 5 10 0 16 9C22 0 36 5 28 16Z" /><path class="badge-ink" d="M16 28L4 16C-4 5 10 0 16 9C22 0 36 5 28 16Z" /><path class="spark-flicker" d="M4 23V29M1 26H7M27 1V7M24 4H30" />
      </g>
      <g v-else-if="tier.id==='introduced'">
        <path class="badge-facet" d="M5 4H27V25H12L5 30Z" /><path class="badge-ink" d="M5 4H27V25H12L5 30Z" /><path class="staff-check" d="M10 10H22M10 15H22M10 20H17" />
      </g>
      <g v-else-if="tier.id==='server_builder'">
        <path class="badge-facet" d="M16 3L28 10V23L16 30L4 23V10Z" /><path class="badge-ink" d="M16 3L28 10V23L16 30L4 23V10ZM4 10L16 17L28 10M16 17V30" /><path class="developer-signal" d="M9 19L12 21M20 23L24 21" />
      </g>
      <g v-else-if="tier.id==='conversation'">
        <path class="badge-ink" d="M3 6H23V21H10L3 27ZM23 11H29V26H22L17 30V23" /><circle class="developer-node" cx="9" cy="13" r="1" /><circle class="developer-node" cx="16" cy="13" r="1" />
      </g>
      <g v-else-if="tier.id==='contributor'">
        <path class="badge-facet" d="M16 3L29 16L16 29L3 16Z" /><path class="badge-ink" d="M16 3L29 16L16 29L3 16Z" /><path class="staff-check" d="M9 16L14 21L23 11" />
      </g>
      <g v-else-if="tier.id==='regular'">
        <circle class="lead-radar" cx="16" cy="16" r="13" /><path class="badge-ink" d="M16 7V16L23 20" /><path class="elite-sparks" d="M5 4V9M2 7H8" />
      </g>
    </svg>
    <span v-if="!iconOnly" class="badge-label">{{ tier.name }}</span>
  </span>
</template>

<style scoped>
[data-tier=badge_starlit]{--badge-color:#ffe09c;--badge-secondary:#ffbe72;--badge-bg:#382934}
[data-tier=badge_endwalker]{--badge-color:#c4a0ff;--badge-secondary:#88aaff;--badge-bg:#251c42}
[data-tier=badge_lumenheart]{--badge-color:#ff9fc6;--badge-secondary:#e4b7ff;--badge-bg:#3a1c35}
.loyalty-badge {
  --badge-color: #ffd798;
  --badge-secondary: #caa3ff;
  --badge-bg: #302136;
  position: relative;
  isolation: isolate;
  contain: paint;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 6px 12px 6px 8px;
  border: 1px solid color-mix(in srgb, var(--badge-color) 65%, transparent);
  border-radius: 8px 13px 8px 13px;
  background: linear-gradient(120deg, var(--badge-bg), #161522);
  color: #fff4ff;
  font-size: 12px;
  font-weight: 750;
  line-height: 1.2;
  vertical-align: middle;
}
.loyalty-badge[data-tier=radiance] { --badge-color: #c8afff; --badge-secondary: #86f6f1; --badge-bg: #292348; }
.loyalty-badge[data-tier=nova] { --badge-color: #9bdfff; --badge-secondary: #ca9dff; --badge-bg: #202b49; border-radius: 13px 5px; }
.loyalty-badge[data-tier=elite] { --badge-color: #ffe1a0; --badge-secondary: #f5a3f5; --badge-bg: #3a2444; border-radius: 6px; }
.loyalty-badge[data-tier=staff] { --badge-color: #8ff3dc; --badge-secondary: #82caff; --badge-bg: #193b3d; border-radius: 11px 5px; }
.loyalty-badge[data-tier=jr_staff] { --badge-color: #b6edb4; --badge-secondary: #d3b9ff; --badge-bg: #263b38; border-radius: 12px 6px; }
.loyalty-badge[data-tier=sr_staff] { --badge-color: #f3c1ff; --badge-secondary: #ffd88c; --badge-bg: #422649; border-radius: 6px 12px; }
.loyalty-badge[data-tier=developer] { --badge-color: #b2ff97; --badge-secondary: #83d9ff; --badge-bg: #1d332d; border-radius: 4px; background: repeating-linear-gradient(0deg, #a3ffc507 0 1px, transparent 1px 5px), linear-gradient(120deg, var(--badge-bg), #161522); }
.loyalty-badge[data-tier=studio_lead] { --badge-color: #ffbd9b; --badge-secondary: #ff84b9; --badge-bg: #402537; border-radius: 5px 13px; }
.loyalty-badge[data-tier=owner] { --badge-color: #e7b8ff; --badge-secondary: #ffe6a3; --badge-bg: #422452; border-radius: 12px 4px; }
.badge-label { position: relative; z-index: 2; overflow-wrap: anywhere; color: #fff4ff; }
.badge-art { position: relative; z-index: 2; width: 26px; height: 26px; flex-shrink: 0; color: var(--badge-color); stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; }
.badge-facet { fill: var(--badge-color); fill-opacity: .2; stroke: none; }
.badge-ink { stroke-dasharray: 90; animation: badge-ink-draw 5s ease-in-out infinite; }
.badge-effects { position: absolute; inset: 0; width: 100%; height: 100%; color: var(--badge-secondary); pointer-events: none; }
.badge-circuit { fill: none; stroke: currentColor; stroke-width: .6; opacity: .18; }
.badge-trace { fill: none; stroke: currentColor; stroke-width: 1; stroke-dasharray: 6 110; animation: badge-circuit-travel 5s linear infinite; opacity: .55; }
.badge-sheen { position: absolute; inset: 0; background: linear-gradient(110deg, transparent 35%, #ffffff19 48%, transparent 61%); transform: translateX(-110%); animation: badge-sheen-travel 7s ease-in-out infinite; pointer-events: none; }
.spark-flicker { animation: badge-spark 4s ease-in-out infinite; }
.radiance-rays { transform-origin: 16px 16px; animation: badge-ray-orbit 18s linear infinite; }
.radiance-core { animation-duration: 6s; }
.radiance-orbit { stroke: var(--badge-secondary); stroke-dasharray: 3 14; transform-origin: 16px 16px; animation: badge-ray-orbit 12s linear infinite reverse; opacity: .65; }
.nova-orbit { stroke: var(--badge-secondary); stroke-dasharray: 8 5; animation: badge-nova-orbit 6s linear infinite; }
.nova-core { animation: badge-nova-breathe 5s ease-in-out infinite; }
.nova-stars { fill: var(--badge-secondary); stroke: none; animation: badge-spark 5s ease-in-out infinite reverse; }
.badge-dust { fill: currentColor; animation: badge-dust-drift 6s ease-in-out infinite; }
.elite-halo { stroke: var(--badge-secondary); stroke-dasharray: 4 8; animation: badge-nova-orbit 5s linear infinite reverse; }
.elite-draw { animation-duration: 4s; }
.elite-crystal { fill: var(--badge-secondary); stroke: none; animation: badge-crystal-glow 4s ease-in-out infinite; }
.elite-sparks { animation: badge-spark 4s ease-in-out infinite reverse; }
.badge-flash { fill: var(--badge-color); transform-origin: 138px 13px; animation: badge-flash-bloom 6s ease-in-out infinite; }
.staff-shield { animation-duration: 7s; }
.staff-check { stroke-dasharray: 20; animation: badge-check-draw 5s ease-in-out infinite; }
.staff-scan { stroke: var(--badge-secondary); animation: badge-shield-scan 5s ease-in-out infinite; }
.staff-beacon { stroke: var(--badge-secondary); transform-origin: 16px 16px; animation: badge-beacon 4s ease-in-out infinite; }
.junior-sprout { stroke: var(--badge-secondary); transform-origin: 16px 23px; animation: badge-sprout 4s ease-in-out infinite; }
.senior-orbit { stroke: var(--badge-secondary); stroke-dasharray: 9 4 2 4; animation: badge-nova-orbit 6s linear infinite; }
.senior-star { fill: var(--badge-secondary); stroke: none; transform-origin: 16px 16px; animation: badge-senior-star 4s ease-in-out infinite; }
.developer-frame { stroke: var(--badge-secondary); stroke-dasharray: 5 9; animation: badge-nova-orbit 7s linear infinite; }
.developer-code { animation-duration: 4s; }
.developer-signal { stroke: var(--badge-secondary); stroke-dasharray: 2 4; animation: badge-nova-orbit 2s linear infinite; }
.developer-node { fill: var(--badge-color); stroke: none; animation: badge-spark 3s ease-in-out infinite; }
.lead-radar { stroke: var(--badge-secondary); stroke-dasharray: 15 6 2 6; animation: badge-nova-orbit 8s linear infinite; }
.lead-axis { opacity: .65; }
.lead-compass { transform-origin: 16px 16px; animation: badge-compass-steer 9s ease-in-out infinite; }
.lead-needle { fill: var(--badge-secondary); stroke: none; }
.lead-center { fill: var(--badge-color); stroke: none; }
.owner-orbit { stroke: var(--badge-secondary); opacity: .7; transform-origin: 16px 16px; animation: badge-ray-orbit 24s linear infinite; }
.owner-sigil { animation-duration: 6s; }
.owner-star { fill: var(--badge-secondary); stroke: none; animation: badge-crystal-glow 5s ease-in-out infinite; }
.loyalty-badge--compact { gap: 4px; padding: 2px 7px 2px 4px; font-size: 10px; border-radius: 5px 8px; }
.loyalty-badge--compact .badge-art { width: 18px; height: 18px; }
.loyalty-badge[data-size=small] { gap: 5px; padding: 3px 8px 3px 5px; font-size: 10px; }
.loyalty-badge[data-size=small] .badge-art { width: 20px; height: 20px; }
.loyalty-badge[data-size=large] { gap: 10px; padding: 8px 15px 8px 10px; font-size: 15px; }
.loyalty-badge[data-size=large] .badge-art { width: 36px; height: 36px; }
.loyalty-badge--icon-only { padding: 6px; }
.loyalty-badge--compact.loyalty-badge--icon-only, .loyalty-badge[data-size=small].loyalty-badge--icon-only { padding: 4px; }
.loyalty-badge[data-size=large].loyalty-badge--icon-only { padding: 8px; }
@keyframes badge-ink-draw { 0%, 100% { stroke-dashoffset: 0; } 35% { stroke-dashoffset: 90; opacity: .4; } 65% { stroke-dashoffset: 0; opacity: 1; } }
@keyframes badge-circuit-travel { to { stroke-dashoffset: -232; } }
@keyframes badge-sheen-travel { 0%, 35% { transform: translateX(-110%); } 75%, 100% { transform: translateX(110%); } }
@keyframes badge-spark { 0%, 100% { opacity: .3; } 40%, 65% { opacity: 1; } }
@keyframes badge-ray-orbit { to { transform: rotate(360deg); } }
@keyframes badge-nova-orbit { to { stroke-dashoffset: -78; } }
@keyframes badge-nova-breathe { 50% { fill-opacity: .65; } }
@keyframes badge-dust-drift { 50% { transform: translateY(-3px); opacity: .4; } }
@keyframes badge-crystal-glow { 50% { fill: var(--badge-color); opacity: .5; } }
@keyframes badge-flash-bloom { 0%, 30%, 100% { transform: scale(.35); opacity: .2; } 55% { transform: scale(1); opacity: .9; } }
@keyframes badge-check-draw { 0%, 100% { stroke-dashoffset: 0; } 30% { stroke-dashoffset: 20; } 65% { stroke-dashoffset: 0; } }
@keyframes badge-shield-scan { 0%, 100% { transform: translateY(0); opacity: .2; } 50% { transform: translateY(12px); opacity: .8; } }
@keyframes badge-compass-steer { 0%, 100% { transform: rotate(-25deg); } 40% { transform: rotate(60deg); } 70% { transform: rotate(15deg); } }
@keyframes badge-sprout { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(6deg); } }
@keyframes badge-beacon { 0%, 100% { transform: scale(.8); opacity: .25; } 50% { transform: scale(1); opacity: 1; } }
@keyframes badge-senior-star { 0%, 100% { transform: scale(.8) rotate(-8deg); opacity: .6; } 50% { transform: scale(1.05) rotate(8deg); opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .loyalty-badge *, .loyalty-badge *::before, .loyalty-badge *::after { animation: none; }
  .badge-sheen { display: none; }
}
</style>
