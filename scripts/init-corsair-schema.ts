/**
 * Creates the `corsair_*` tables on Postgres.
 *
 *   npx tsx scripts/init-corsair-schema.ts
 *
 * Corsair does not create its own tables — `setupCorsair` only introspects and
 * warns when one is missing — so this has to exist somewhere. It is kept out of
 * `drizzle/` because Drizzle owns `meeting_note` only; mixing the two would have
 * drizzle-kit offering to drop these on every push.
 *
 * Column types are derived from Corsair's own Zod table schemas
 * (`CorsairIntegrationsSchema` and friends), not translated from the old SQLite
 * `migration.sql`. Two differences matter:
 *
 *   - `config` / `data` / `payload` are `jsonb`, not `text`. Corsair's setup check
 *     maps `z.record(...)` to `jsonb`, it hands Kysely raw JS objects on insert, and
 *     its read schemas expect objects back. On SQLite these were TEXT holding JSON;
 *     using `text` here would hand Corsair a string where it expects a record.
 *   - `corsair_permissions` is included. The old SQLite file omitted it entirely,
 *     so the permissions feature would have failed on first use.
 *
 * Idempotent: safe to re-run, creates nothing twice, drops nothing.
 */
import { sql } from "../src/server/pg";

async function main() {
  // `expires_at` is text, not a timestamp: Corsair types it as `z.string()` and
  // compares it as one.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS corsair_integrations (
      id          text PRIMARY KEY,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      name        text NOT NULL,
      config      jsonb,
      dek         text
    );

    CREATE TABLE IF NOT EXISTS corsair_accounts (
      id              text PRIMARY KEY,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      tenant_id       text NOT NULL,
      integration_id  text NOT NULL REFERENCES corsair_integrations(id) ON DELETE CASCADE,
      config          jsonb,
      dek             text
    );

    CREATE TABLE IF NOT EXISTS corsair_entities (
      id          text PRIMARY KEY,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      account_id  text NOT NULL REFERENCES corsair_accounts(id) ON DELETE CASCADE,
      entity_id   text NOT NULL,
      entity_type text NOT NULL,
      version     text NOT NULL DEFAULT '1',
      data        jsonb
    );

    CREATE TABLE IF NOT EXISTS corsair_events (
      id          text PRIMARY KEY,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      account_id  text NOT NULL REFERENCES corsair_accounts(id) ON DELETE CASCADE,
      event_type  text NOT NULL,
      payload     jsonb,
      status      text DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS corsair_permissions (
      id          text PRIMARY KEY,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      token       text NOT NULL,
      plugin      text NOT NULL,
      endpoint    text NOT NULL,
      args        text NOT NULL,
      tenant_id   text NOT NULL DEFAULT 'default',
      status      text NOT NULL DEFAULT 'pending',
      expires_at  text NOT NULL,
      error       text
    );
  `);

  /**
   * The lookups this app actually performs. Without these, every
   * `findByEntityId` is a sequential scan — which was survivable on a local SQLite
   * file and is not over a network round trip.
   *
   * The entity index is (account_id, entity_type, entity_id) because `entity_id`
   * alone is not unique: Gmail reuses one id for a single-message thread and its
   * message, so the same value appears under both `entity_type` values.
   */
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS corsair_integrations_name_key
      ON corsair_integrations (name);

    CREATE INDEX IF NOT EXISTS corsair_accounts_tenant_idx
      ON corsair_accounts (tenant_id);

    CREATE UNIQUE INDEX IF NOT EXISTS corsair_accounts_tenant_integration_key
      ON corsair_accounts (tenant_id, integration_id);

    CREATE UNIQUE INDEX IF NOT EXISTS corsair_entities_lookup_key
      ON corsair_entities (account_id, entity_type, entity_id);

    CREATE INDEX IF NOT EXISTS corsair_entities_account_type_idx
      ON corsair_entities (account_id, entity_type);

    CREATE INDEX IF NOT EXISTS corsair_events_account_idx
      ON corsair_events (account_id);

    CREATE INDEX IF NOT EXISTS corsair_permissions_token_idx
      ON corsair_permissions (token);
  `);

  const tables = await sql<{ table_name: string }[]>`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name LIKE 'corsair_%'
     ORDER BY table_name
  `;

  console.log("corsair tables present:");
  for (const t of tables) console.log(`  ${t.table_name}`);

  const expected = [
    "corsair_accounts",
    "corsair_entities",
    "corsair_events",
    "corsair_integrations",
    "corsair_permissions",
  ];
  const missing = expected.filter(
    (e) => !tables.some((t) => t.table_name === e),
  );
  if (missing.length) {
    console.error(`\nMISSING: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("\nAll 5 corsair tables ready.");
  }

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await sql.end().catch(() => {});
});
