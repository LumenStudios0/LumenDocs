const validId = value => typeof value === 'string' && /^[a-z0-9-]{1,80}$/.test(value)
const keyFor = actorId => {
  if (!/^\d{17,20}$/.test(actorId)) throw new Error('Staff identity could not be verified for guide preferences.')
  return `lumen-staff-guides-v1:${actorId}`
}

export function readStaffPreferences(storage, actorId) {
  const saved = storage.getItem(keyFor(actorId))
  if (!saved) return { saved: [], read: [] }
  const result = JSON.parse(saved)
  if (!result || !['saved', 'read'].every(field =>
    Array.isArray(result[field]) && result[field].length <= 100 && result[field].every(validId))) {
    throw new Error('Saved guide preferences are invalid. Reset guide preferences to recover.')
  }
  return { saved: [...new Set(result.saved)], read: [...new Set(result.read)] }
}

export function toggleStaffPreference(storage, actorId, field, guideId) {
  if (!['saved', 'read'].includes(field) || !validId(guideId)) throw new Error('Choose a valid guide preference.')
  const result = readStaffPreferences(storage, actorId)
  const current = result[field]
  if (!current.includes(guideId) && current.length >= 100) throw new Error('You can track up to 100 guides per preference.')
  result[field] = current.includes(guideId) ? current.filter(id => id !== guideId) : [...current, guideId]
  storage.setItem(keyFor(actorId), JSON.stringify(result))
  return result
}

export function clearStaffPreferences(storage, actorId) {
  storage.removeItem(keyFor(actorId))
}
