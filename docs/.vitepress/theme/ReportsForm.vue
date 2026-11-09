<script setup lang="ts">
import { computed, ref } from 'vue'

type ReportType = 'bug' | 'compatibility' | 'feature'

const assistantEndpoint = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
const reportType = ref<ReportType>('bug')
const plugin = ref('')
const serverSoftware = ref('')
const version = ref('')
const status = ref<'untested' | 'broken' | 'partial' | 'working'>('untested')
const discordUsername = ref('')
const productKey = ref('')
const consoleLog = ref('')
const title = ref('')
const description = ref('')
const submitting = ref(false)
const error = ref('')
const submitted = ref(false)
const reportTypeRail = ref<HTMLElement | null>(null)

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

function getReportsEndpoint() {
  if (!assistantEndpoint) return ''

  const endpoint = new URL(assistantEndpoint, window.location.origin)
  endpoint.pathname = endpoint.pathname.replace(/\/chat\/?$/, '').replace(/\/$/, '') + '/reports'
  endpoint.search = ''
  return endpoint.toString()
}

async function submitReport() {
  if (submitting.value) return
  const endpoint = getReportsEndpoint()
  if (!endpoint) {
    error.value = 'Reports are temporarily unavailable. Please contact us on Discord.'
    return
  }

  const payload = reportType.value === 'bug'
    ? {
        type: reportType.value,
        plugin: plugin.value,
        serverSoftware: serverSoftware.value,
        version: version.value,
        discordUsername: discordUsername.value,
        productKey: productKey.value,
        consoleLog: consoleLog.value,
        description: description.value,
      }
    : reportType.value === 'compatibility'
      ? {
          type: reportType.value,
          plugin: plugin.value,
          serverSoftware: serverSoftware.value,
          version: version.value,
          status: status.value,
          description: description.value,
        }
      : {
          type: reportType.value,
          plugin: plugin.value,
          discordUsername: discordUsername.value,
          title: title.value,
          description: description.value,
        }

  submitting.value = true
  error.value = ''
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await response.json().catch(() => ({})) as { error?: string; ok?: boolean }
    if (!response.ok || !result.ok) {
      throw new Error(result.error || 'Could not deliver the report. Please try again later.')
    }

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
      <p>Choose a report type. Every submission goes to the same Lumen Studios reports inbox.</p>
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
        <label>
          <span>Product key <small>Only if relevant</small></span>
          <input v-model="productKey" maxlength="200" autocomplete="off" placeholder="Never include a password">
        </label>
      </details>

      <label>
        <span>Discord username <small>Optional</small></span>
        <input v-model="discordUsername" maxlength="100" autocomplete="off" placeholder="If you’d like us to follow up">
      </label>

      <p v-if="error" class="reports-message reports-error" role="alert">{{ error }}</p>
      <p v-if="submitted" class="reports-message reports-success" role="status">
        Your {{ reportTypeLabel.toLowerCase() }} has been sent to the Lumen Studios reports inbox.
      </p>
      <button class="reports-submit" type="submit" :disabled="submitting || submitted">
        {{ submitting ? 'Sending…' : submitted ? 'Submitted' : `Send ${reportTypeLabel.toLowerCase()}` }}
      </button>
    </form>

    <p class="reports-privacy">Only include information needed to understand your report. Do not send passwords or private server credentials.</p>
  </section>
</template>
