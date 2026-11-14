<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getDiscordSession } from './discord-session'
import { communityRequest } from './community-api'

type ReportType = 'bug' | 'compatibility' | 'feature'

const reportType = ref<ReportType>('bug')
const plugin = ref('')
const serverSoftware = ref('')
const version = ref('')
const status = ref<'untested' | 'broken' | 'partial' | 'working'>('untested')
const consoleLog = ref('')
const title = ref('')
const description = ref('')
const submitting = ref(false)
const error = ref('')
const submitted = ref(false)
const reportTypeRail = ref<HTMLElement | null>(null)
const signedIn = ref(false)
const ticketId = ref('')
function syncSession() {
  try { signedIn.value = !!getDiscordSession() }
  catch (sessionError) { console.error('Unable to read report session:', sessionError); error.value = 'This browser could not access your Discord session.'; signedIn.value = false }
}
onMounted(() => { syncSession(); window.addEventListener('lumen-discord-user', syncSession) })
onUnmounted(() => window.removeEventListener('lumen-discord-user', syncSession))

const reportTypes: { value: ReportType; label: string }[] = [
  { value: 'bug', label: 'Bug report' },
  { value: 'compatibility', label: 'Compatibility' },
  { value: 'feature', label: 'Feature request' },
]

const reportTypeLabel = computed(() => ({
  bug: 'Bug report',
  compatibility: 'Compatibility report',
  feature: 'Feature request',
}[reportType.value]))

function selectReportType(type: ReportType) {
  reportType.value = type
  submitted.value = false
  error.value = ''
}

function scrollReportTypes(direction: -1 | 1) {
  reportTypeRail.value?.scrollBy({ left: direction * 180, behavior: 'smooth' })
}

async function submitReport() {
  if (submitting.value) return
  if (!getDiscordSession()) {
    error.value = 'Connect your Discord account with Log in before submitting a ticket.'
    return
  }
  const captured = getDiscordSession()
  const payload = {
    type: reportType.value,
    title: title.value || `${reportTypeLabel.value}: ${plugin.value}`.slice(0, 120),
    productId: plugin.value || undefined,
    serverSoftware: serverSoftware.value || undefined,
    minecraftVersion: version.value || undefined,
    body: [
      description.value,
      reportType.value === 'compatibility' ? `Reported compatibility: ${status.value}` : '',
      consoleLog.value ? `Sanitized console excerpt:\n${consoleLog.value}` : '',
    ].filter(Boolean).join('\n\n'),
  }
  if (payload.body.length > 4000) {
    error.value = 'Please shorten the combined description and console excerpt to 4,000 characters.'
    return
  }

  submitting.value = true
  error.value = ''
  try {
    const result = await communityRequest<{ ticket: { id: string } }>('/tickets', { method: 'POST', body: JSON.stringify(payload) })
    if (captured !== getDiscordSession()) return
    ticketId.value = result.ticket.id
    submitted.value = true
  } catch (caught) {
    error.value = caught instanceof Error
      ? caught.message
      : 'Could not deliver the report. Please try again later.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="reports-workspace" aria-label="Submit a report">
    <div class="reports-intro">
      <span class="reports-eyebrow">LUMEN STUDIOS SUPPORT</span>
      <h2>What would you like to share?</h2>
      <p>Choose a report type. Your ticket is saved privately on the website, where staff can reply.</p>
    </div>

    <form class="reports-form" @submit.prevent="submitReport">
      <div class="reports-type-field">
        <span>Report type</span>
        <div class="plugin-category-slider reports-type-slider">
          <button
            class="plugin-category-arrow"
            type="button"
            aria-label="Scroll report types left"
            @click="scrollReportTypes(-1)"
          >
            ←
          </button>
          <div ref="reportTypeRail" class="plugin-category-rail" role="group" aria-label="Choose report type">
            <button
              v-for="type in reportTypes"
              :key="type.value"
              type="button"
              :aria-pressed="reportType === type.value"
              @click="selectReportType(type.value)"
            >
              {{ type.label }}
            </button>
          </div>
          <button
            class="plugin-category-arrow"
            type="button"
            aria-label="Scroll report types right"
            @click="scrollReportTypes(1)"
          >
            →
          </button>
        </div>
      </div>

      <div v-if="reportType !== 'feature'" class="reports-fields">
        <label>
          <span>Plugin</span>
          <input v-model="plugin" required maxlength="100" placeholder="e.g. LumenAuction">
        </label>
        <div class="reports-field-row">
          <label>
            <span>Server software</span>
            <input v-model="serverSoftware" required maxlength="100" placeholder="e.g. Paper">
          </label>
          <label>
            <span>Minecraft version</span>
            <input v-model="version" required maxlength="60" placeholder="e.g. 1.21.4">
          </label>
        </div>
      </div>
      <label v-else>
        <span>Related plugin <small>Optional</small></span>
        <input v-model="plugin" maxlength="100" placeholder="e.g. LumenAuction">
      </label>

      <label v-if="reportType === 'compatibility'" class="reports-status-field">
        <span>Compatibility status</span>
        <select v-model="status" required>
          <option value="untested">Untested</option>
          <option value="broken">Broken</option>
          <option value="partial">Partial</option>
          <option value="working">Working</option>
        </select>
      </label>

      <label v-if="reportType === 'feature'">
        <span>Request title</span>
        <input v-model="title" required maxlength="120" placeholder="A short summary of the idea">
      </label>

      <label>
        <span>{{ reportType === 'bug' ? 'What happened?' : reportType === 'compatibility' ? 'Test details' : 'How would this help?' }}</span>
        <textarea
          v-model="description"
          required
          maxlength="2000"
          rows="5"
          :placeholder="reportType === 'bug'
            ? 'What did you expect, and what happened instead?'
            : reportType === 'compatibility'
              ? 'Share what you tested and any relevant details.'
              : 'Describe the feature and the problem it would solve.'"
        />
      </label>

      <details v-if="reportType === 'bug'" class="reports-extra-fields">
        <summary>More details <span>Optional</span></summary>
        <label>
          <span>Console message</span>
          <textarea v-model="consoleLog" maxlength="2000" rows="3" placeholder="Paste the relevant error or warning" />
        </label>
      </details>

      <p v-if="!signedIn" class="reports-message" role="status">Connect your Discord account using Log in before submitting. Your identity is verified by the website.</p>
      <p class="reports-message">Remove license keys, passwords, tokens, and webhook URLs from all logs.</p>

      <p v-if="error" class="reports-message reports-error" role="alert">{{ error }}</p>
      <p v-if="submitted" class="reports-message reports-success" role="status">
        Your {{ reportTypeLabel.toLowerCase() }} is saved. <a :href="`/account/tickets?ticket=${ticketId}`">Open your website ticket →</a>
      </p>
      <button class="reports-submit" type="submit" :disabled="submitting || submitted || !signedIn">
        {{ submitting ? 'Sending…' : submitted ? 'Submitted' : `Send ${reportTypeLabel.toLowerCase()}` }}
      </button>
    </form>

    <p class="reports-privacy">Only include information needed to understand your report. Do not send passwords or private server credentials.</p>
  </section>
</template>
