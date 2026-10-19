/**
 * One-off copy of the local SQLite data into Postgres.
 *
 *   npx tsx scripts/init-corsair-schema.ts        # tables first
 *   npx drizzle-kit push                          # meeting_note
 *   npx tsx scripts/migrate-sqlite-to-postgres.ts
 *
 * Why this is worth doing rather than starting clean: stored OAuth credentials are
 * encrypted with per-integration and per-account DEKs, and those DEKs are encrypted
 * with `CORSAIR_KEK` alone — not with anything tied to SQLite or to a row id. So as
 * long as the KEK is unchanged the encrypted blobs are portable verbatim, and all
 * three connected accounts keep working. Starting fresh would mean nine consent
 * round trips (3 tenants x 3 plugins).
 *
 * ## Ids are remapped, not copied
 *
 * The target is not assumed to be empty. This Neon database already held an older
 * single-tenant Corsair setup whose `corsair_integrations` rows carry the same
 * `name` values under *different* UUIDs. Copying ids verbatim therefore fails two
 * ways: a unique violation on `name`, and — worse, had it not failed — account rows
 * whose `integration_id` points at a row that does not exist here.
 *
 * So every row is matched on its natural key and foreign keys are translated:
 *
 *   corsair_integrations  by  name
 *   corsair_accounts      by  (tenant_id, integration_id)
 *   corsair_entities      by  (account_id, entity_type, entity_id)
 *
 * `corsair_entities` needs all three columns because `entity_id` alone is not
 * unique: Gmail reuses one id for a single-message thread and its message, so the
 * same value appears under two `entity_type`s.
 *
 * ## Integration config is overwritten deliberately
 *
 * Where a plugin exists on both sides, SQLite's `config` and `dek` win. A refresh
 * token is only valid for the `client_id` it was issued to, so keeping the older
 * Neon OAuth client would leave every migrated grant failing with `invalid_grant`.
 * SQLite is the source of truth for the setup that currently works.
 *
 * Two type conversions are not straight copies:
 *   - `config` / `data` / `payload` were TEXT holding JSON in SQLite and are `jsonb`
 *     here, so each is parsed and handed over as an object.
 *   - `meeting_note.id` was SQLite AUTOINCREMENT and is now `serial`, so the
 *     sequence is reset afterwards or the next insert would collide.
 *
 * Idempotent: every write is an upsert on the natural key, so a partial run can be
 * repeated. Nothing is deleted and the SQLite files are never written to.
 */
import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { sql } from "../src/server/pg";

const CORSAIR_DB = "corsair.db";
const APP_DB = "app.db";

/** SQLite stores these as JSON text; Postgres wants an object for jsonb. */
function parseJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    // Better to surface the row than to silently write null over a credential.
    throw new Error(`Column held non-JSON text: ${value.slice(0, 120)}`);
  }
}

/** SQLite keeps timestamps as ISO-ish text; normalise, and never produce Invalid Date. */
function parseDate(value: unknown): Date {
  if (!value) return new Date();
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

type Row = Record<string, unknown>;

async function migrateCorsair(lite: Database.Database) {
  const have = new Set(
    (
      lite
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[]
    ).map((r) => r.name),
  );

  /** SQLite integration id -> the id this row actually has in Postgres. */
  const integrationIdMap = new Map<string, string>();
  /** SQLite account id -> the id this row actually has in Postgres. */
  const accountIdMap = new Map<string, string>();

  // ---- integrations -------------------------------------------------------
  if (have.has("corsair_integrations")) {
    const rows = lite
      .prepare("SELECT * FROM corsair_integrations")
      .all() as Row[];

    for (const r of rows) {
      const name = String(r.name);
      // DO UPDATE rather than DO NOTHING: see the note on client_id above.
      const [out] = await sql<{ id: string }[]>`
        INSERT INTO corsair_integrations
          (id, created_at, updated_at, name, config, dek)
        VALUES (
          ${String(r.id)},
          ${parseDate(r.created_at)},
          ${parseDate(r.updated_at)},
          ${name},
          ${sql.json(parseJson(r.config) as never)},
          ${(r.dek as string) ?? null}
        )
        ON CONFLICT (name) DO UPDATE
           SET config     = EXCLUDED.config,
               dek        = EXCLUDED.dek,
               updated_at = EXCLUDED.updated_at
        RETURNING id
      `;
      integrationIdMap.set(String(r.id), out.id);
      const remapped = out.id !== String(r.id);
      console.log(
        `  integration ${name.padEnd(16)} -> ${out.id.slice(0, 8)}…${remapped ? " (remapped)" : ""}`,
      );
    }
  }

  // ---- accounts -----------------------------------------------------------
  if (have.has("corsair_accounts")) {
    const rows = lite.prepare("SELECT * FROM corsair_accounts").all() as Row[];

    for (const r of rows) {
      const sqliteIntegrationId = String(r.integration_id);
      const pgIntegrationId = integrationIdMap.get(sqliteIntegrationId);
      if (!pgIntegrationId) {
        throw new Error(
          `Account ${r.id} references integration ${sqliteIntegrationId}, ` +
            `which has no counterpart in Postgres. Migrate integrations first.`,
        );
      }

      const [out] = await sql<{ id: string }[]>`
        INSERT INTO corsair_accounts
          (id, created_at, updated_at, tenant_id, integration_id, config, dek)
        VALUES (
          ${String(r.id)},
          ${parseDate(r.created_at)},
          ${parseDate(r.updated_at)},
          ${String(r.tenant_id)},
          ${pgIntegrationId},
          ${sql.json(parseJson(r.config) as never)},
          ${(r.dek as string) ?? null}
        )
        ON CONFLICT (tenant_id, integration_id) DO UPDATE
           SET config     = EXCLUDED.config,
               dek        = EXCLUDED.dek,
               updated_at = EXCLUDED.updated_at
        RETURNING id
      `;
      accountIdMap.set(String(r.id), out.id);
    }
    console.log(`  accounts: ${rows.length} upserted`);
  }

  // ---- entities -----------------------------------------------------------
  if (have.has("corsair_entities")) {
    const rows = lite.prepare("SELECT * FROM corsair_entities").all() as Row[];
    const CHUNK = 250;
    let skipped = 0;

    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows
        .slice(i, i + CHUNK)
        .map((r) => {
          const pgAccountId = accountIdMap.get(String(r.account_id));
          if (!pgAccountId) {
            skipped++;
            return null;
          }
          return {
            id: String(r.id),
            created_at: parseDate(r.created_at),
            updated_at: parseDate(r.updated_at),
            account_id: pgAccountId,
            entity_id: String(r.entity_id),
            entity_type: String(r.entity_type),
            version: String(r.version ?? "1"),
            data: sql.json(parseJson(r.data) as never),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (batch.length) {
        await sql`
          INSERT INTO corsair_entities ${sql(
            batch as never,
            "id",
            "created_at",
            "updated_at",
            "account_id",
            "entity_id",
            "entity_type",
            "version",
            "data",
          )}
          ON CONFLICT (account_id, entity_type, entity_id) DO UPDATE
             SET data       = EXCLUDED.data,
                 version    = EXCLUDED.version,
                 updated_at = EXCLUDED.updated_at
        `;
      }
      process.stdout.write(
        `\r  entities: ${Math.min(i + CHUNK, rows.length)}/${rows.length}`,
      );
    }
    if (rows.length) process.stdout.write("\n");
    if (skipped) {
      console.log(`  entities: ${skipped} skipped (account not migrated)`);
    }
  }

  // ---- events -------------------------------------------------------------
  if (have.has("corsair_events")) {
    const rows = lite.prepare("SELECT * FROM corsair_events").all() as Row[];
    const CHUNK = 250;
    let skipped = 0;

    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows
        .slice(i, i + CHUNK)
        .map((r) => {
          const pgAccountId = accountIdMap.get(String(r.account_id));
          if (!pgAccountId) {
            skipped++;
            return null;
          }
          return {
            id: String(r.id),
            created_at: parseDate(r.created_at),
            updated_at: parseDate(r.updated_at),
            account_id: pgAccountId,
            event_type: String(r.event_type),
            payload: sql.json(parseJson(r.payload) as never),
            status: String(r.status ?? "pending"),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (batch.length) {
        // Events have no natural key worth deduplicating on, so a repeat run
        // simply leaves the existing row alone.
        await sql`
          INSERT INTO corsair_events ${sql(
            batch as never,
            "id",
            "created_at",
            "updated_at",
            "account_id",
            "event_type",
            "payload",
            "status",
          )}
          ON CONFLICT (id) DO NOTHING
        `;
      }
      process.stdout.write(
        `\r  events: ${Math.min(i + CHUNK, rows.length)}/${rows.length}`,
      );
    }
    if (rows.length) process.stdout.write("\n");
    if (skipped) {
      console.log(`  events: ${skipped} skipped (account not migrated)`);
    }
  }
}

async function migrateNotes() {
  if (!existsSync(APP_DB)) {
    console.log(`\n${APP_DB} not found — skipping meeting_note.`);
    return;
  }

  const lite = new Database(APP_DB, { readonly: true });
  const exists = lite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='meeting_note'",
    )
    .get();
  if (!exists) {
    lite.close();
    console.log("\nno meeting_note table in app.db — skipping.");
    return;
  }

  const rows = lite.prepare("SELECT * FROM meeting_note").all() as Row[];
  for (const r of rows) {
    // Drizzle wrote these as unix seconds under SQLite's `timestamp` mode.
    const toDate = (v: unknown) =>
      typeof v === "number" ? new Date(v * 1000) : parseDate(v);
    await sql`
      INSERT INTO meeting_note (id, event_id, content, created_at, updated_at)
      VALUES (
        ${r.id as number},
        ${String(r.event_id)},
        ${(r.content as string) ?? ""},
        ${toDate(r.created_at)},
        ${r.updated_at ? toDate(r.updated_at) : null}
      )
      ON CONFLICT (event_id) DO UPDATE
         SET content    = EXCLUDED.content,
             updated_at = EXCLUDED.updated_at
    `;
  }
  lite.close();

  // Ids were copied verbatim, so the sequence is still at 1 and the next insert
  // would collide with row 1.
  if (rows.length) {
    await sql`
      SELECT setval(
        pg_get_serial_sequence('meeting_note', 'id'),
        COALESCE((SELECT MAX(id) FROM meeting_note), 1)
      )
    `;
  }
  console.log(`\n  meeting_note: ${rows.length} upserted`);
}

async function verify() {
  console.log("\n=== now in Postgres ===");
  for (const t of [
    "corsair_integrations",
    "corsair_accounts",
    "corsair_entities",
    "corsair_events",
    "meeting_note",
  ]) {
    const [{ count }] = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM ${sql(t)}`;
    console.log(`  ${t.padEnd(22)} ${count}`);
  }

  const tenants = await sql<
    { tenant_id: string; plugins: string; count: string }[]
  >`
    SELECT a.tenant_id,
           string_agg(i.name, ',' ORDER BY i.name) AS plugins,
           COUNT(*)::text AS count
      FROM corsair_accounts a
      JOIN corsair_integrations i ON i.id = a.integration_id
     GROUP BY a.tenant_id
     ORDER BY a.tenant_id`;
  console.log("\naccounts per tenant:");
  for (const t of tenants) {
    console.log(`  ${t.tenant_id.padEnd(14)} ${t.count}  [${t.plugins}]`);
  }

  // Entities only count for something if they hang off the right account.
  const ents = await sql<
    { tenant_id: string; entity_type: string; count: string }[]
  >`
    SELECT a.tenant_id, e.entity_type, COUNT(*)::text AS count
      FROM corsair_entities e
      JOIN corsair_accounts a ON a.id = e.account_id
     GROUP BY a.tenant_id, e.entity_type
     ORDER BY a.tenant_id, e.entity_type`;
  console.log("\nentities per tenant and type:");
  for (const e of ents) {
    console.log(
      `  ${e.tenant_id.padEnd(14)} ${e.entity_type.padEnd(16)} ${e.count}`,
    );
  }

  // Anything left behind by the earlier setup that this migration did not touch.
  const orphans = await sql<{ tenant_id: string; count: string }[]>`
    SELECT tenant_id, COUNT(*)::text AS count
      FROM corsair_accounts
     WHERE tenant_id NOT IN ('personal', 'jungleworks', 'finance')
     GROUP BY tenant_id
     ORDER BY tenant_id`;
  if (orphans.length) {
    console.log("\ntenants not in this app's TENANTS list (pre-existing):");
    for (const o of orphans) console.log(`  ${o.tenant_id.padEnd(14)} ${o.count}`);
    console.log("  left in place — harmless, but see the note at the end.");
  }
}

async function main() {
  if (!existsSync(CORSAIR_DB)) {
    throw new Error(`${CORSAIR_DB} not found — nothing to migrate from.`);
  }
  const lite = new Database(CORSAIR_DB, { readonly: true });
  try {
    console.log("=== copying from SQLite ===");
    await migrateCorsair(lite);
  } finally {
    lite.close();
  }
  await migrateNotes();
  await verify();
  console.log(
    "\nDone. Credentials were copied still encrypted — with CORSAIR_KEK unchanged,\n" +
      "the connected accounts keep working and need no re-consent.",
  );
  await sql.end();
}

main().catch(async (e) => {
  console.error("\nMigration failed:", e);
  process.exitCode = 1;
  await sql.end().catch(() => {});
});
