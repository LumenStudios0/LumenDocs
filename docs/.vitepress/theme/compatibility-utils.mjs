/** @param {string} value */
export function versionParts(value) {
  if (!/^\d+(?:\.\d+){1,2}$/.test(value.trim())) return null
  return value.trim().split('.').map(Number)
}
/** @param {number[]} a
 * @param {number[]} b
 */
export function compareVersions(a, b) {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] || 0) - (b[index] || 0)
    if (difference) return Math.sign(difference)
  }
  return 0
}
/**
 * @param {{status: string, java: number|null, apiVersion: string|null, software: string[], dependencies: string[], notes: string[]}} plugin
 * @param {{version: string, java: number, software: string, installed: string[]}} setup
 */
export function checkCompatibility(plugin, setup) {
  const blockers = []
  const warnings = []
  if (plugin.status === 'coming-soon') return { blockers: [], warnings: ['Coming soon. No released compatibility promise is available.'], verdict: 'coming-soon' }
  if (plugin.java && setup.java < plugin.java) blockers.push(`Java ${plugin.java}+ is required by the build; your server uses Java ${setup.java}.`)
  if (!plugin.java) warnings.push('Java requirement is not established from accessible sources.')
  const selected = versionParts(setup.version)
  if (!selected) blockers.push('Enter a Minecraft version such as 1.21.6.')
  const minimum = plugin.apiVersion ? versionParts(plugin.apiVersion) : null
  if (selected && minimum && compareVersions(selected, minimum) < 0) blockers.push(`The descriptor requires API ${plugin.apiVersion}; your server version is older.`)
  if (plugin.software.length && !plugin.software.some(value => value.toLowerCase() === setup.software.toLowerCase())) {
    warnings.push(`${setup.software} is not established as a supported platform in the inspected sources.`)
  }
  if (setup.software === 'Folia') warnings.push('Folia needs explicit region-threading support. Bukkit/Paper API compatibility alone is not sufficient.')
  const missing = plugin.dependencies.filter(dependency => !setup.installed.some(value => value.toLowerCase() === dependency.toLowerCase()))
  if (missing.length) blockers.push(`Required dependencies not selected: ${missing.join(', ')}.`)
  warnings.push('Meeting build requirements does not prove runtime compatibility. Check release notes and test your exact server build on staging.')
  return { blockers, warnings, verdict: blockers.length ? 'blocked' : 'needs-verification' }
}
