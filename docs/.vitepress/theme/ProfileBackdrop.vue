<script setup lang="ts">
defineProps<{ preset: string }>()
</script>
<template>
  <span v-if="preset !== 'none'" class="profile-backdrop" :data-preset="preset" aria-hidden="true">
    <span class="backdrop-layer backdrop-one" /><span class="backdrop-layer backdrop-two" />
    <svg v-if="['stars','rain','embers','prism','clouds','forest','frost'].includes(preset)" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
      <g class="backdrop-drawing">
        <template v-if="preset === 'stars'">
          <path d="M20 50L100 30L180 70L240 20M180 70L280 140L360 80M100 30L70 180L160 240" />
          <circle v-for="(point,i) in [[20,50],[100,30],[180,70],[240,20],[280,140],[360,80],[70,180],[160,240]]" :key="i" :cx="point[0]" :cy="point[1]" r="3" />
        </template>
        <template v-else-if="preset === 'rain'"><path v-for="i in 12" :key="i" :d="`M${i*35} -30l-28 85m12 50l-28 85m12 50l-28 85`" /></template>
        <template v-else-if="preset === 'embers'"><path v-for="i in 10" :key="i" :d="`M${i*42} 290l-5 -8l5 -10l5 10Z`" /></template>
        <template v-else-if="preset === 'prism'"><path v-for="i in 9" :key="i" :d="`M${i*48} ${i%2*90+30}l16 20l-10 40l-18 -23Z`" /></template>
        <template v-else-if="preset === 'clouds'"><path d="M-20 110h60v-14h26v-18h50v18h24v14h55v20H-20ZM190 225h50v-14h25v-18h60v18h32v14h65v22H190Z" /></template>
        <template v-else-if="preset === 'frost'"><path d="M0 290L85 90L180 270L255 45L400 290ZM60 148L85 90L115 148L90 130ZM229 111L255 45L291 112L263 91Z" /></template>
        <template v-else><path v-for="i in 7" :key="i" :d="`M${i*65-35} 290v-120m-35 40l35 -80l35 80m-50 -30l15 -50l20 50`" /></template>
      </g>
    </svg>
  </span>
</template>
<style scoped>
.profile-backdrop{position:absolute;inset:0;overflow:hidden;pointer-events:none;border-radius:inherit;contain:paint;opacity:.26}
.backdrop-layer{position:absolute;inset:0}
.profile-backdrop svg{position:absolute;inset:0;width:100%;height:100%;fill:none;stroke:#bd8bff;stroke-width:1.5}
[data-preset=aurora] .backdrop-one{background:conic-gradient(from 180deg at 50% 0,#8755ff44,#75ffc566,#8654ff88,transparent);filter:blur(20px);animation:profile-aurora 14s ease-in-out infinite alternate}
[data-preset=aurora] .backdrop-two{background:radial-gradient(ellipse at 70% 20%,#45ddff55,transparent 60%);animation:profile-drift 18s ease-in-out infinite alternate}
[data-preset=portal] .backdrop-one{inset:-70%;background:repeating-conic-gradient(#943dff44 0 12deg,transparent 12deg 24deg);animation:profile-turn 36s linear infinite}
[data-preset=portal] .backdrop-two{background:radial-gradient(ellipse,#702dc977,transparent 65%)}
[data-preset=stars] .backdrop-one{background:radial-gradient(circle at 10% 20%,#d7b8ff 1px,transparent 2px);background-size:41px 57px;animation:profile-drift 12s ease-in-out infinite alternate}
[data-preset=stars] .backdrop-drawing{stroke-dasharray:6 3;animation:profile-constellation 12s ease-in-out infinite}
[data-preset=rain] .backdrop-drawing{animation:profile-rain 7s linear infinite}
[data-preset=waves] .backdrop-one,[data-preset=waves] .backdrop-two{inset:15% -50% -60%;border:2px solid #af82ff;border-radius:45%;background:#6748b944;animation:profile-turn 24s linear infinite}
[data-preset=waves] .backdrop-two{inset:25% -50% -50%;animation-direction:reverse;animation-duration:32s}
[data-preset=grid] .backdrop-one{background:linear-gradient(#cb90ff55 1px,transparent 1px),linear-gradient(90deg,#cb90ff55 1px,transparent 1px);background-size:32px 32px;animation:profile-grid 12s linear infinite}
[data-preset=grid] .backdrop-two{background:linear-gradient(180deg,transparent,#ed88ff77,transparent);height:30%;animation:profile-scan 9s ease-in-out infinite}
[data-preset=embers] .backdrop-one{background:radial-gradient(ellipse at bottom,#ff735944,transparent 65%)}
[data-preset=embers] svg{stroke:#ffb876;fill:#ff875944}
[data-preset=embers] .backdrop-drawing{animation:profile-embers 12s ease-out infinite}
[data-preset=prism] svg{fill:#ac7aff33;stroke:#caa3ff}
[data-preset=prism] .backdrop-drawing{transform-origin:center;animation:profile-prism 16s ease-in-out infinite alternate}
[data-preset=orbit] .backdrop-one{inset:15% -10%;border:1px solid #c4b4ff;border-radius:50%;box-shadow:0 0 0 35px #9f72ff22,0 0 0 70px #9f72ff11;transform:rotate(-25deg)}
[data-preset=orbit] .backdrop-two{inset:15% -10%;border-radius:50%;background:conic-gradient(transparent 70%,#be9eff99 85%,transparent);animation:profile-turn 18s linear infinite}
[data-preset=clouds] svg{fill:#bca6ff44;stroke:#cfbcff}
[data-preset=clouds] .backdrop-drawing{animation:profile-clouds 20s ease-in-out infinite alternate}
[data-preset=amethyst]{background:repeating-conic-gradient(from 30deg,#925bd933 0 60deg,#bf91ed44 60deg 120deg);background-size:90px 90px}
[data-preset=obsidian]{background:linear-gradient(45deg,#8369a733 25%,transparent 25% 75%,#8369a733 75%),linear-gradient(45deg,#8369a733 25%,transparent 25% 75%,#8369a733 75%);background-position:0 0,25px 25px;background-size:50px 50px}
[data-preset=sunset]{background:linear-gradient(#62307e66,#e57cad88,#ffbb8344)}
[data-preset=frost]{background:linear-gradient(#30467466,#a3d9ff22)}
[data-preset=frost] svg{fill:#d2e5ff22;stroke:#bfdcff}
[data-preset=forest]{background:linear-gradient(#213b4544,#60aa7744)}
[data-preset=forest] svg{stroke:#9ae3b6;stroke-width:3}
@keyframes profile-aurora{to{transform:translateX(12%) skewX(18deg)}}
@keyframes profile-drift{to{transform:translate(8px,16px)}}
@keyframes profile-turn{to{rotate:360deg}}
@keyframes profile-constellation{50%{stroke-dashoffset:40;opacity:.35}}
@keyframes profile-rain{to{transform:translate(-20px,100px)}}
@keyframes profile-grid{to{background-position:32px 64px}}
@keyframes profile-scan{50%{transform:translateY(240%)}}
@keyframes profile-embers{0%{opacity:0;transform:translateY(20px)}20%{opacity:1}100%{opacity:0;transform:translate(20px,-280px)}}
@keyframes profile-prism{to{transform:translate(10px,22px) rotate(8deg)}}
@keyframes profile-clouds{to{transform:translateX(40px)}}
@media(prefers-reduced-motion:reduce){.profile-backdrop *{animation:none!important}}
</style>
