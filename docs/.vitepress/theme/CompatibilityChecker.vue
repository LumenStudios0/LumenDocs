<script setup lang="ts">
import { computed, ref } from 'vue'
import data from './plugin-compatibility-data.json'
import { checkCompatibility } from './compatibility-utils.mjs'
const search = ref('')
const software = ref('Paper')
const minecraft = ref('1.21.6')
const java = ref(21)
const dependencies = ref('')
const filtered = computed(() => data.plugins.filter(plugin => `${plugin.name} ${plugin.notes.join(' ')}`.toLowerCase().includes(search.value.trim().toLowerCase())))
const results = computed(() => filtered.value.map(plugin => ({
  plugin, check: checkCompatibility(plugin, { version: minecraft.value, java: java.value, software: software.value, installed: dependencies.value.split(',').map(value => value.trim()).filter(Boolean) }),
})))
</script>

<template>
  <section class="website-workspace" aria-label="Plugin compatibility checker">
    <header><p class="website-kicker">SOURCE-CHECKED PLUGIN REQUIREMENTS</p><h2>Check your setup before installing.</h2><p class="website-note">All identified studio plugins are listed, including upcoming or unverified projects. These checks compare declared build/API requirements, not a promise of runtime support. Evidence checked {{ data.checkedAt }}.</p></header>
    <div class="website-panel">
      <div class="website-columns"><label>Server software<select v-model="software"><option>Paper</option><option>Purpur</option><option>Spigot</option><option>Bukkit</option><option>Folia</option><option>Velocity</option></select></label><label>Minecraft version<input v-model="minecraft" placeholder="1.21.6" maxlength="20"></label><label>Java runtime<select v-model.number="java"><option :value="8">Java 8</option><option :value="11">Java 11</option><option :value="17">Java 17</option><option :value="21">Java 21</option><option :value="25">Java 25</option></select></label><label>Installed dependencies<input v-model="dependencies" placeholder="PacketEvents, Vault, PlaceholderAPI" maxlength="1000"></label></div>
      <label>Find a plugin<input v-model="search" type="search" placeholder="Plugin name or requirement"></label>
      <p class="website-note">{{ results.length }} / {{ data.plugins.length }} plugins shown. Optional integrations do not block the base check.</p>
    </div>
    <div class="website-list"><article v-for="{plugin, check} in results" :key="plugin.id">
      <p class="website-meta"><span class="website-badge">{{ check.verdict === 'blocked' ? 'Requirements not met' : check.verdict === 'coming-soon' ? 'Coming soon / unverified' : 'Runtime verification needed' }}</span>{{ plugin.software.join(', ') || 'Platform not established' }}</p>
      <h3>{{ plugin.name }}</h3><p class="website-note">Java: {{ plugin.java ? `${plugin.java}+` : 'Unknown' }} · Declared API: {{ plugin.apiVersion || 'Unknown' }} · Required dependencies: {{ plugin.dependencies.join(', ') || 'None declared' }}</p>
      <p v-for="blocker in check.blockers" :key="blocker" class="website-message website-error">{{ blocker }}</p>
      <p v-for="warning in check.warnings" :key="warning" class="website-note">{{ warning }}</p>
      <details><summary>Evidence and integration notes</summary><p class="website-note">Optional dependencies: {{ plugin.optionalDependencies.join(', ') || 'None declared' }}</p><p v-for="note in plugin.notes" :key="note" class="website-note">{{ note }}</p><p v-for="(source,index) in plugin.sources" :key="index" class="website-note">{{ source.path }} · revision {{ source.ref.slice(0, 12) }}<br>{{ source.evidence }}</p></details>
      <div class="website-actions"><a :href="plugin.docs">Setup guide →</a><a href="/error-guides">Troubleshoot an error →</a></div>
    </article></div>
    <p v-if="!results.length" class="website-note">No plugins match that search.</p>
  </section>
</template>
