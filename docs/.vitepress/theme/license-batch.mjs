/**
 * @param {string[]} ids
 * @param {(id: string) => Promise<{state: string, message: string}>} apply
 * @param {() => boolean} isCurrent
 */
export async function runLicenseBatch(ids, apply, isCurrent) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 10 || ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    throw new Error('Select between 1 and 10 unique licenses or products.')
  }
  const results = []
  let stopped = false
  for (const id of ids) {
    if (stopped || !isCurrent()) {
      results.push({ id, state: 'not_attempted', message: 'Not attempted. Review earlier results before starting another batch.' })
      continue
    }
    try {
      const result = await apply(id)
      if (!result || typeof result.message !== 'string' || !['granted', 'revoked', 'skipped', 'failed', 'uncertain', 'processing'].includes(result.state)) {
        throw new Error('The service returned an invalid batch result.')
      }
      results.push({ id, ...result })
      stopped = ['failed', 'uncertain', 'processing'].includes(result.state)
    } catch (error) {
      results.push({ id, state: 'uncertain', message: `${error instanceof Error ? error.message : 'Request failed.'} Check the customer profile before retrying; the change may have been saved.` })
      stopped = true
    }
  }
  return results
}
