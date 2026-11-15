export function mergeStaffDrafts(drafts, items, key, createDraft) {
  const merged = { ...drafts }
  for (const item of items) {
    if (!Object.hasOwn(merged, item[key])) merged[item[key]] = createDraft(item)
  }
  return merged
}
