<script setup lang="ts">
defineProps<{ name: string; url: string; frame: string; decoration: string; compact?: boolean }>()
</script>
<template>
  <span class="profile-avatar" :class="{compact}" :data-frame="frame" :data-decoration="decoration">
    <img v-if="url" :src="url" alt="" referrerpolicy="no-referrer"><span v-else class="avatar-initial">{{ name.slice(0,2) }}</span>
    <svg v-if="frame !== 'none'" class="avatar-frame" viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path v-if="['diamond','emerald','amethyst','quartz'].includes(frame)" d="M50 3L83 17L97 50L83 83L50 97L17 83L3 50L17 17Z" />
      <rect v-else-if="['netherite','obsidian','copper','redstone'].includes(frame)" x="6" y="6" width="88" height="88" rx="23" />
      <circle v-else cx="50" cy="50" r="45" />
      <circle class="frame-trace" cx="50" cy="50" r="46" />
      <path class="frame-gems" d="M50 0L55 6L50 12L45 6ZM94 45L100 50L94 55L88 50ZM50 88L55 94L50 100L45 94ZM6 45L12 50L6 55L0 50Z" />
    </svg>
    <svg v-if="decoration !== 'none'" class="avatar-decoration" viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <g class="deco-drawing">
        <path v-if="decoration==='wings'" d="M12 35L0 16L2 48L14 62M88 35L100 16L98 48L86 62M5 26L12 48M95 26L88 48" />
        <path v-else-if="decoration==='flames'" d="M10 74Q-5 60 9 44Q3 58 18 58Q25 69 10 74ZM90 74Q105 60 91 44Q97 58 82 58Q75 69 90 74Z" />
        <path v-else-if="decoration==='crystals'" d="M8 25L14 10L20 25L14 42ZM80 72L88 55L96 72L88 93Z" />
        <g v-else-if="decoration==='orbits'"><ellipse cx="50" cy="50" rx="48" ry="20" transform="rotate(-35 50 50)" /><circle cx="86" cy="23" r="5" /></g>
        <path v-else-if="decoration==='leaves'" d="M4 17Q23 5 22 28Q10 33 4 17ZM78 72Q95 65 96 90Q76 95 78 72Z" />
        <path v-else-if="decoration==='lightning'" d="M10 20L1 38H10L5 53L20 32H12ZM90 55L80 72H88L85 87L99 67H91Z" />
        <path v-else-if="decoration==='snow'" d="M10 12V32M0 22H20M3 15L17 29M3 29L17 15M89 70V90M79 80H99M82 73L96 87M82 87L96 73" />
        <path v-else-if="decoration==='crown'" d="M25 15L20 1L35 8L50 0L65 8L80 1L75 15ZM28 19H72" />
        <g v-else-if="decoration==='bubbles'"><circle cx="7" cy="27" r="6" /><circle cx="90" cy="70" r="8" /><circle cx="20" cy="87" r="4" /></g>
        <path v-else-if="decoration==='hearts'" d="M5 20V12H12V17H17V12H24V20L14 30ZM78 83V75H85V80H90V75H97V83L87 93Z" />
        <path v-else-if="decoration==='comets'" d="M3 30L20 10M4 37L27 12M90 70L76 90M96 73L82 93M17 10L22 6L27 11L22 16Z" />
        <path v-else d="M12 7L15 15L23 18L15 21L12 29L9 21L1 18L9 15ZM88 72L91 80L99 83L91 86L88 94L85 86L77 83L85 80Z" />
      </g>
    </svg>
  </span>
</template>
<style scoped>
.profile-avatar{--frame:#b486ff;position:relative;display:inline-grid;place-items:center;width:80px;height:80px;flex-shrink:0;vertical-align:middle;isolation:isolate}
.profile-avatar img,.avatar-initial{width:calc(100% - 12px);height:calc(100% - 12px);border-radius:50%;object-fit:cover;background:var(--vp-c-bg-soft);border:3px solid var(--vp-c-bg-soft)}
.avatar-initial{display:grid;place-items:center;color:var(--vp-c-text-1);font-weight:800}
.avatar-frame,.avatar-decoration{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;stroke:var(--frame);stroke-width:2}
.avatar-frame{contain:paint}.frame-trace{stroke-dasharray:7 18;transform-origin:50px 50px;animation:avatar-orbit 18s linear infinite}
.frame-gems{fill:var(--frame);fill-opacity:.55;stroke-width:1}
.profile-avatar[data-frame=diamond]{--frame:#8ee9ff}.profile-avatar[data-frame=emerald]{--frame:#8cedb6}.profile-avatar[data-frame=redstone]{--frame:#ff8088}.profile-avatar[data-frame=netherite]{--frame:#b8a6b5}.profile-avatar[data-frame=prismarine]{--frame:#8ef4e2}.profile-avatar[data-frame=gold]{--frame:#ffe29c}.profile-avatar[data-frame=frost]{--frame:#c5e7ff}.profile-avatar[data-frame=obsidian]{--frame:#a38bd2}.profile-avatar[data-frame=copper]{--frame:#ecac88}.profile-avatar[data-frame=quartz]{--frame:#f4d8f1}
.avatar-decoration{inset:-10%;width:120%;height:120%;stroke:#d9b4ff;stroke-linecap:round;stroke-linejoin:round;fill:#b275ff22}
.deco-drawing{transform-origin:50px 50px;animation:avatar-float 6s ease-in-out infinite}
[data-decoration=orbits] .deco-drawing{animation:avatar-orbit 20s linear infinite}
[data-decoration=flames] .deco-drawing{fill:#75e5f344;stroke:#92efff;animation:avatar-flame 5s ease-in-out infinite}
[data-decoration=crown] .deco-drawing{stroke:#ffe29c;fill:#ffe29c33}
[data-decoration=leaves] .deco-drawing{stroke:#94e6b4;fill:#79c68933}
[data-decoration=lightning] .deco-drawing{stroke:#ffbe96;animation:avatar-flame 4s ease-in-out infinite}
[data-decoration=hearts] .deco-drawing{stroke:#ffa1d3;fill:#f48bcb44}
[data-decoration=snow] .deco-drawing{stroke:#c5e7ff;animation:avatar-orbit 30s linear infinite}
[data-decoration=comets] .deco-drawing{stroke-dasharray:18 6;animation:avatar-comet 5s ease-in-out infinite}
.compact{width:42px;height:42px}
@keyframes avatar-orbit{to{transform:rotate(360deg)}}
@keyframes avatar-float{50%{transform:translateY(-3px) rotate(4deg)}}
@keyframes avatar-flame{50%{opacity:.4;transform:scale(.94)}}
@keyframes avatar-comet{50%{stroke-dashoffset:24;transform:rotate(-8deg)}}
@media(prefers-reduced-motion:reduce){.profile-avatar *{animation:none!important}}
</style>
