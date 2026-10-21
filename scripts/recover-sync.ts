/**
 * Completes a sync that died before it could restore.
 *
 *   npx tsx scripts/recover-sync.ts
 *
 * `refreshMail` stashes hydrated message fields in `sync_restore_buffer`, lets
 * `messages.list` clobber the rows, then merges the stash back. If the request dies
 * in between — a client timeout that aborts the handler, a serverless function
 * hitting its wall clock — the merge never runs and those messages sit un-hydrated
 * while their data waits in the buffer.
 *
 * This runs the merge that was owed and releases any lock left behind. `refreshMail`
 * now does the same thing at the start of every run, so this script is only needed
 * to clean up after a version that did not.
 *
 * Idempotent, and safe while nothing is syncing: the merge only touches rows that
 * actually lost their `subject`.
 */
import { sql } from "../src/server/pg";

async function main() {
  const buffered = await sql<{ account_id: string; count: string }[]>`
    SELECT account_id, COUNT(*)::text AS count
      FROM sync_restore_buffer
     GROUP BY account_id`;

  if (buffered.length === 0) {
    console.log("No buffered rows — nothing was left owed.");
  }

  for (const b of buffered) {
    const [{ tenant_id }] = await sql<{ tenant_id: string }[]>`
      SELECT tenant_id FROM corsair_accounts WHERE id = ${b.account_id}`;
    console.log(`\naccount ${b.account_id} (${tenant_id}): ${b.count} buffered rows`);

    const before = await sql<{ hydrated: string }[]>`
      SELECT COUNT(*)::text AS hydrated FROM corsair_entities
       WHERE account_id = ${b.account_id} AND entity_type='messages'
         AND data ? 'subject'`;

    const merged = await sql`
      UPDATE corsair_entities e
         SET data = b.data || e.data,
             updated_at = now()
        FROM sync_restore_buffer b
       WHERE b.account_id = e.account_id
         AND b.entity_id = e.entity_id
         AND e.entity_type = 'messages'
         AND NOT (e.data ? 'subject')`;

    const after = await sql<{ hydrated: string }[]>`
      SELECT COUNT(*)::text AS hydrated FROM corsair_entities
       WHERE account_id = ${b.account_id} AND entity_type='messages'
         AND data ? 'subject'`;

    console.log(
      `  restored ${merged.count} row(s): hydrated ${before[0].hydrated} -> ${after[0].hydrated}`,
    );

    await sql`DELETE FROM sync_restore_buffer WHERE account_id = ${b.account_id}`;
    await sql`DELETE FROM sync_lock WHERE account_id = ${b.account_id}`;
    console.log("  buffer cleared, lock released");
  }

  const locks = await sql<{ account_id: string; started_at: Date }[]>`
    SELECT account_id, started_at FROM sync_lock`;
  if (locks.length) {
    console.log("\nlocks still held (no buffer to merge):");
    for (const l of locks) {
      console.log(`  ${l.account_id} since ${l.started_at.toISOString()}`);
    }
    await sql`DELETE FROM sync_lock`;
    console.log("  released");
  }

  console.log("\nper-tenant message hydration now:");
  const rows = await sql<
    { tenant_id: string; total: string; hydrated: string }[]
  >`
    SELECT a.tenant_id,
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE e.data ? 'subject')::text AS hydrated
      FROM corsair_entities e
      JOIN corsair_accounts a ON a.id = e.account_id
     WHERE e.entity_type = 'messages'
     GROUP BY a.tenant_id
     ORDER BY a.tenant_id`;
  for (const r of rows) {
    console.log(`  ${r.tenant_id.padEnd(14)} ${r.hydrated}/${r.total} hydrated`);
  }

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await sql.end().catch(() => {});
});
