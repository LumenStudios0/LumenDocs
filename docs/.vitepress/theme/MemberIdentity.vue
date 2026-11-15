<script setup lang="ts">
import type { MemberIdentity } from './community-api'
defineProps<{ name: string; profile?: MemberIdentity | null; linked?: boolean }>()
</script>
<template>
  <span class="member-identity">
    <a v-if="profile && linked !== false" :href="`/members/?id=${profile.id}`" :style="{ borderColor: profile.accent }">{{ profile.displayName }}</a>
    <strong v-else>{{ profile?.displayName || name }}</strong>
    <span v-if="profile?.tier" class="member-tier" :class="{ 'member-tier-elite': profile.tier.id === 'elite' }">{{ profile.tier.name }}</span>
  </span>
</template>
<style scoped>
.member-identity{display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center}.member-identity a{font-weight:700;border-bottom:2px solid;text-decoration:none;color:var(--vp-c-text-1)}.member-identity a:hover{text-decoration:underline}.member-tier{font-size:10px;font-weight:750;padding:2px 6px;border:1px solid #9f72ff66;border-radius:6px;background:#9f72ff18;color:var(--vp-c-text-1)}.member-tier-elite{background:linear-gradient(110deg,#9f72ff18,#e7c76e22,#9f72ff18);background-size:200% 100%;animation:elite-badge 5s ease infinite}@keyframes elite-badge{50%{background-position:100% 50%}}@media(prefers-reduced-motion:reduce){.member-tier-elite{animation:none}}
</style>
