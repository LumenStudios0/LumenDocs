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

const widgetNames = ['launchpad', 'checklist', 'handover', 'progress']
const widgetKey = actorId => `${keyFor(actorId)}:widgets`

export function readStaffWidgets(storage, actorId) {
  const saved = storage.getItem(widgetKey(actorId))
  if (!saved) return [...widgetNames]
  const widgets = JSON.parse(saved)
  if (!Array.isArray(widgets) || widgets.some(name => !widgetNames.includes(name)) || new Set(widgets).size !== widgets.length) {
    throw new Error('Saved widget preferences are invalid. Reset widgets to recover.')
  }
  return widgets
}

export function setStaffWidget(storage, actorId, widget, enabled) {
  if (!widgetNames.includes(widget) || typeof enabled !== 'boolean') throw new Error('Choose a valid widget.')
  const widgets = readStaffWidgets(storage, actorId).filter(name => name !== widget)
  if (enabled) widgets.push(widget)
  storage.setItem(widgetKey(actorId), JSON.stringify(widgets))
  return widgets
}

export function clearStaffWidgets(storage, actorId) {
  storage.removeItem(widgetKey(actorId))
}
