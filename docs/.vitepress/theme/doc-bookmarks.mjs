const key = 'lumen-doc-bookmarks-v1'

/** @param {string} path */
export function validBookmarkPath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') &&
    !/[\u0000-\u0020\\]/.test(path) && !/^\/(?:admin|account|auth)(?:\/|$)/.test(path)
}

/** @param {Pick<Storage, 'getItem'>} storage */
export function readBookmarks(storage) {
  const saved = storage.getItem(key)
  if (!saved) return []
  const result = JSON.parse(saved)
  if (!Array.isArray(result) || !result.every(item => item && validBookmarkPath(item.path) && typeof item.title === 'string')) {
    throw new Error('Saved bookmarks are invalid. Clear them from the bookmarks page to start again.')
  }
  return result
}

/** @param {Pick<Storage, 'getItem'|'setItem'>} storage
 * @param {{path: string, title: string}} bookmark
 */
export function toggleBookmark(storage, bookmark) {
  if (!validBookmarkPath(bookmark.path)) throw new Error('This page cannot be bookmarked.')
  const current = readBookmarks(storage)
  const exists = current.some(item => item.path === bookmark.path)
  if (!exists && current.length >= 100) throw new Error('You can save up to 100 bookmarks. Remove one before adding another.')
  const result = exists ? current.filter(item => item.path !== bookmark.path) : [{ path: bookmark.path, title: bookmark.title.slice(0, 160) }, ...current]
  storage.setItem(key, JSON.stringify(result))
  return result
}

/** @param {Pick<Storage, 'removeItem'>} storage */
export function clearBookmarks(storage) { storage.removeItem(key) }
