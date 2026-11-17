export async function ensurePointsAccount(db, id) {
  await db.prepare(`INSERT INTO lumen_points_accounts(user_id,referral_code,created_at)
    VALUES (?,?,?) ON CONFLICT(user_id) DO NOTHING`)
    .bind(id, 'LP-' + crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase(), new Date().toISOString()).run()
}
