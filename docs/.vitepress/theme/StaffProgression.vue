<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { communityDate, communityRequest } from './community-api'

type WindowName = 'weekly' | 'monthly' | 'all-time'
type Leader = { id: string; name: string; level: number; windowXp: number; totalXp: number }
type Log = { staffId: string; staffName: string; points: number; source: 'ticket_close' | 'rating_bonus'; ticketId: string; createdAt: string }
const windowName = ref<WindowName>('weekly')
const leaderboard = ref<Leader[]>([])
const logs = ref<Log[]>([])
const currentStaff = ref({ level: 1, totalXp: 0 })
const loading = ref(false)
const error = ref('')
const labels: Record<WindowName, string> = { weekly: 'This week', monthly: 'This month', 'all-time': 'All time' }

async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = await communityRequest<{
      leaderboard: Leader[]
      logs: Log[]
      currentStaff: { level: number; totalXp: number }
    }>(`/staff/progression?window=${windowName.value}`)
    leaderboard.value = result.leaderboard
    logs.value = result.logs
    currentStaff.value = result.currentStaff
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Could not load the staff leaderboard.'
  } finally { loading.value = false }
}

watch(windowName, () => { void load() })
onMounted(() => { void load() })
</script>

<template>
  <section id="staff-leaderboard" class="website-panel staff-progression" aria-labelledby="staff-progression-title">
    <header>
      <h3 id="staff-progression-title">Staff XP and leaderboard</h3>
      <p class="website-note">Earn 100 XP when you close an eligible ticket assigned to you after more than five of your public replies. The ticket owner’s one-time rating adds 20 XP per star. Level = floor(total XP ÷ 100) + 1, with no level cap. XP awards are recorded once per ticket.</p>
    </header>
    <div class="website-actions">
      <label>Leaderboard period
        <select v-model="windowName" :disabled="loading">
          <option value="weekly">Weekly (Monday UTC)</option>
          <option value="monthly">Monthly (UTC)</option>
          <option value="all-time">All-time</option>
        </select>
      </label>
      <button type="button" :disabled="loading" @click="load">Refresh</button>
    </div>
    <p v-if="error" class="website-message website-error" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="website-note" role="status">Loading staff progression…</p>
    <p v-else class="website-message" role="status">Your level: {{ currentStaff.level }} · {{ currentStaff.totalXp }} lifetime XP</p>
    <div v-if="!loading && !error" class="website-list">
      <article v-for="(member, index) in leaderboard" :key="member.id">
        <p class="website-meta">#{{ index + 1 }} · Level {{ member.level }}</p>
        <h4>{{ member.name }}</h4>
        <p class="website-note">{{ member.windowXp }} XP {{ labels[windowName].toLowerCase() }} · {{ member.totalXp }} lifetime XP</p>
      </article>
      <p v-if="!leaderboard.length" class="website-note">No staff XP has been earned yet.</p>
    </div>
    <section v-if="!loading && !error" aria-labelledby="staff-xp-log-title">
      <h4 id="staff-xp-log-title">Recent staff XP awards</h4>
      <ul v-if="logs.length">
        <li v-for="(entry, index) in logs" :key="`${entry.ticketId}-${entry.source}-${index}`">
          {{ entry.staffName }} · +{{ entry.points }} XP · {{ entry.source === 'ticket_close' ? 'Ticket closure' : 'Ticket rating bonus' }}
          · #{{ entry.ticketId.slice(0, 8) }} · {{ communityDate(entry.createdAt) }}
        </li>
      </ul>
      <p v-else class="website-note">Recent team XP awards will appear here.</p>
    </section>
  </section>
</template>
