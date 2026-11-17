export async function ensurePointsAccount(db, id) {
  await db.prepare(`INSERT INTO lumen_points_accounts(user_id,referral_code,created_at)
    VALUES (?,?,?) ON CONFLICT(user_id) DO NOTHING`)
    .bind(id, 'LP-' + crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase(), new Date().toISOString()).run()
}

export async function pointsBalance(db, id) {
  const row = await db.prepare('SELECT units FROM lumen_points_balances WHERE user_id=?').bind(id).first()
  if (!row || !Number.isSafeInteger(row.units)) throw new Error('Points balance could not be verified.')
  return row.units / 100
}
