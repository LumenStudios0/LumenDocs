<script setup lang="ts">
import { computed, ref } from 'vue'
import data from './plugin-compatibility-data.json'
const search = ref('')
const product = ref('')
const generic = [
  { id: 'java-runtime', title: 'UnsupportedClassVersionError', match: ['UnsupportedClassVersionError', 'class file version', 'compiled by a more recent version'], productIds: [], cause: 'The server Java runtime is older than the plugin bytecode requires.', steps: ['Run java -version with the Java executable that launches your server.', 'Compare the Java requirement in the compatibility checker.', 'Update the server startup Java path, then fully restart. Test on staging first.'], docs: '/getting-started/compatibility' },
  { id: 'dependency-missing', title: 'UnknownDependencyException / missing dependency', match: ['UnknownDependencyException', 'Unknown/missing dependency', 'Missing required dependency'], productIds: [], cause: 'A required dependency is absent or failed to enable.', steps: ['Check required dependencies for your plugin in the compatibility checker.', 'Install the correct dependency from its official source and fully restart.', 'Read the dependency startup error if it still fails. Optional dependencies may only disable integrations.'], docs: '/getting-started/installation' },
  { id: 'yaml-format', title: 'InvalidConfigurationException / YAML syntax', match: ['InvalidConfigurationException', 'ScannerException', 'mapping values are not allowed here', 'could not find expected'], productIds: [], cause: 'The edited YAML configuration is not valid.', steps: ['Back up the configuration before editing.', 'Check indentation, tabs, unclosed quotes, and duplicate keys near the reported line.', 'Compare with the default config for your exact jar version. Never upload secrets.'], docs: '/troubleshooting' },
]
const guides = [...data.errors, ...generic]
const results = computed(() => {
  const query = search.value.trim().toLowerCase()
  return guides.filter(guide => (!product.value || !guide.productIds.length || guide.productIds.includes(product.value)) && (!query || `${guide.title} ${guide.cause} ${guide.match.join(' ')} ${guide.steps.join(' ')}`.toLowerCase().includes(query) || guide.match.some(fragment => query.includes(fragment.toLowerCase()))))
})
</script>

<template>
  <section class="website-workspace" aria-label="Searchable error guides">
    <header><p class="website-kicker">TROUBLESHOOTING / SEARCH BY ERROR</p><h2>Find the next useful step.</h2><p class="website-note">Search a short error message or paste a sanitized stack trace. Searching happens in your browser and is not sent to an AI or support service. These are troubleshooting suggestions, not an automatic diagnosis.</p></header>
    <div class="website-panel"><label>Error message / keyword<textarea v-model="search" rows="3" maxlength="10000" placeholder="UnsupportedClassVersionError, license, YAML, missing dependency…"></textarea></label><label>Plugin<select v-model="product"><option value="">All plugins</option><option v-for="plugin in data.plugins" :key="plugin.id" :value="plugin.id">{{ plugin.name }}</option></select></label></div>
    <div class="website-list"><article v-for="guide in results" :key="guide.id"><p class="website-meta">{{ guide.productIds.length ? 'Source-backed plugin guidance' : 'General server setup guidance' }}</p><h3>{{ guide.title }}</h3><p class="website-body">{{ guide.cause }}</p><ol><li v-for="step in guide.steps" :key="step" class="website-note">{{ step }}</li></ol><a :href="guide.docs">Read the related guide →</a></article></div>
    <p v-if="!results.length" class="website-message">No matching guide. Try the first error line rather than the entire log, or <a href="/account/tickets">open a support ticket</a> with sanitized details.</p>
  </section>
</template>
