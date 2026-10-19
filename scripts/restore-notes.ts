/**
 * Re-imports meeting notes from `app.db`, assigning each to its owning tenant.
 *
 *   npx tsx scripts/restore-notes.ts
 *
 * Needed because adding the `NOT NULL tenant_id` column via `drizzle-kit push
 * --force` rewrote `meeting_note` and dropped its rows — `--force` is exactly the
 * flag that suppresses the "this will truncate" prompt. The SQLite file is still
 * the original source, so nothing was actually lost.
 *
 * The owner of each note is derived rather than guessed: a note's `event_id` is a
 * Google calendar event id, and `corsair_entities` records which account synced
 * that event. A note whose event belongs to no tenant is left out rather than
 * being parked under an arbitrary one.
 *
 * Idempotent: upserts on `(tenant_id, event_id)`.
 */
import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { sql } from "../src/server/pg";

const APP_DB = "app.db";

async function main() {
  if (!existsSync(APP_DB)) {
    throw new Error(`${APP_DB} not found — nothing to restore from.`);
  }

  const lite = new Database(APP_DB, { readonly: true });
  const notes = lite
    .prepare("SELECT id, event_id, content, created_at, updated_at FROM meeting_note")
    .all() as {
    id: number;
    event_id: string;
    content: string | null;
    created_at: number | string | null;
    updated_at: number | string | null;
  }[];
  lite.close();

  console.log(`found ${notes.length} note(s) in ${APP_DB}`);

  const toDate = (v: unknown) =>
    typeof v === "number" ? new Date(v * 1000) : v ? new Date(v as string) : new Date();

  let restored = 0;
  let unmatched = 0;

  for (const n of notes) {
    const owners = await sql<{ tenant_id: string }[]>`
      SELECT DISTINCT a.tenant_id
        FROM corsair_entities e
        JOIN corsair_accounts a ON a.id = e.account_id
       WHERE e.entity_type = 'events' AND e.entity_id = ${n.event_id}`;

    if (owners.length === 0) {
      console.log(`  ${n.event_id}: no tenant has this event — skipped`);
      unmatched++;
      continue;
    }
    if (owners.length > 1) {
      // The same event can legitimately appear on two calendars (an invite), so
      // the note is restored for each rather than one being picked arbitrarily.
      console.log(
        `  ${n.event_id}: on ${owners.length} calendars — restoring for each`,
      );
    }

    for (const o of owners) {
      await sql`
        INSERT INTO meeting_note (tenant_id, event_id, content, created_at, updated_at)
        VALUES (
          ${o.tenant_id},
          ${n.event_id},
          ${n.content ?? ""},
          ${toDate(n.created_at)},
          ${n.updated_at ? toDate(n.updated_at) : null}
        )
        ON CONFLICT (tenant_id, event_id) DO UPDATE
           SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at`;
      console.log(`  ${n.event_id} -> ${o.tenant_id} (${(n.content ?? "").length} chars)`);
      restored++;
    }
  }

  const rows = await sql<{ tenant_id: string; event_id: string; len: number }[]>`
    SELECT tenant_id, event_id, length(COALESCE(content, '')) AS len
      FROM meeting_note ORDER BY tenant_id, event_id`;
  console.log(`\nmeeting_note now holds ${rows.length} row(s):`);
  for (const r of rows) {
    console.log(`  ${r.tenant_id.padEnd(14)} ${r.event_id} (${r.len} chars)`);
  }
  if (unmatched) console.log(`\n${unmatched} note(s) had no owning calendar.`);

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await sql.end().catch(() => {});
});
