<script setup lang="ts">
defineProps<{ effect: string }>()
</script>
<template>
  <span v-if="['effect_aurora','effect_orbit'].includes(effect)" class="shop-profile-effect" :data-effect="effect" aria-hidden="true">
    <i /><i /><i /><b v-for="i in 8" :key="i" :style="{ '--i': i }" />
  </span>
</template>
<style scoped>
.shop-profile-effect{position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:inherit;contain:paint}
.shop-profile-effect i{position:absolute;border-radius:50%;inset:-40%;opacity:.25}
[data-effect=effect_aurora] i{background:conic-gradient(transparent 25%,#ac6aff,#70edc8,transparent 65%);filter:blur(35px);animation:shop-veil 18s linear infinite}
[data-effect=effect_aurora] i:nth-child(2){inset:-80% 10%;animation-direction:reverse;animation-duration:26s}
[data-effect=effect_aurora] i:nth-child(3){display:none}
[data-effect=effect_orbit] i{inset:12% -15%;border:1px solid #c8a4ff;transform:rotate(-25deg);box-shadow:0 0 16px #a970ff33;animation:shop-orbit 16s ease-in-out infinite alternate}
[data-effect=effect_orbit] i:nth-child(2){inset:3% -25%;animation-delay:-6s}
[data-effect=effect_orbit] i:nth-child(3){inset:25% -10%;animation-direction:alternate-reverse}
.shop-profile-effect b{position:absolute;left:calc(var(--i)*11%);top:calc(10% + mod(var(--i)*17,75)*1%);width:3px;height:3px;background:#d6bdff;border-radius:50%;box-shadow:0 0 9px #b58aff;animation:shop-twinkle 4s ease-in-out infinite;animation-delay:calc(var(--i)*-.6s)}
@keyframes shop-veil{to{rotate:360deg}}
@keyframes shop-orbit{to{transform:rotate(12deg) scale(1.12);opacity:.65}}
@keyframes shop-twinkle{50%{opacity:.2;transform:scale(.5) translateY(-10px)}}
@media(prefers-reduced-motion:reduce){.shop-profile-effect *{animation:none!important}}
</style>
