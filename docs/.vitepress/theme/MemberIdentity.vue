<script setup lang="ts">
import type { MemberIdentity } from './community-api'
import LoyaltyBadge from './LoyaltyBadge.vue'
defineProps<{ name: string; profile?: MemberIdentity | null; linked?: boolean }>()
</script>
<template>
  <span class="member-identity">
    <a v-if="profile && linked !== false" :href="`/members/?id=${profile.id}`" :style="{ borderColor: profile.accent }">{{ profile.displayName }}</a>
    <strong v-else>{{ profile?.displayName || name }}</strong>
    <LoyaltyBadge v-for="badge in profile?.badges ?? (profile?.tier ? [profile.tier] : [])" :key="badge.id" :tier="badge" :icon-only="profile?.badgeIconOnly" compact />
  </span>
</template>
<style scoped>
.member-identity{display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center}.member-identity a{font-weight:700;border-bottom:2px solid;text-decoration:none;color:var(--vp-c-text-1)}.member-identity a:hover{text-decoration:underline}
</style>
