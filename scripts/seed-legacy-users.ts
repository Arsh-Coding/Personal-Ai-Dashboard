/**
 * Attaches the three original tenants to the accounts that own them.
 *
 *   npx drizzle-kit push                        # app_user + meeting_note.tenant_id
 *   npx tsx scripts/seed-legacy-users.ts
 *
 * Before sign-in existed, tenant ids were words in `src/lib/tenants.ts` and the
 * email for each lived in the same file. Those ids are still attached to all the
 * migrated mail and calendar data in `corsair_accounts`, so rather than renumbering
 * anything this seeds an `app_user` row per tenant with `google_sub` left null.
 *
 * The first time one of these addresses signs in, `resolveUserFromGoogle` finds the
 * row by verified email, claims it by filling in `google_sub`, and that person
 * lands on their existing data with nothing to reconnect. Anyone else who signs in
 * gets a fresh tenant and an empty dashboard.
 *
 * Also backfills `meeting_note.tenant_id`, which the column did not exist for
 * until now. Notes were keyed by `event_id` alone, so each one is assigned to
 * whichever tenant actually has that calendar event.
 *
 * Idempotent: upserts by email, and only fills note rows still lacking a tenant.
 */
import { sql } from "../src/server/pg";

/** The hardcoded table that `src/lib/tenants.ts` used to hold. */
const LEGACY = [
  { id: "personal", email: "arshpreet.singh.dev@gmail.com", name: "Personal" },
  { id: "jungleworks", email: "arshpreet.singh@jungleworks.com", name: "Jungleworks" },
  { id: "finance", email: "gamersgrip888@gmail.com", name: "Finance" },
];

async function main() {
  console.log("=== seeding app_user for the legacy tenants ===");

  for (const t of LEGACY) {
    // Only seed a tenant that actually has Corsair accounts; otherwise this would
    // invent users for ids that own nothing.
    const [{ count }] = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM corsair_accounts WHERE tenant_id = ${t.id}`;

    if (count === "0") {
      console.log(`  ${t.id.padEnd(14)} skipped — no corsair_accounts rows`);
      continue;
    }

    await sql`
      INSERT INTO app_user (id, google_sub, email, name, created_at)
      VALUES (${t.id}, NULL, ${t.email.toLowerCase()}, ${t.name}, now())
      ON CONFLICT (id) DO UPDATE
         SET email = EXCLUDED.email
      `;
    console.log(`  ${t.id.padEnd(14)} seeded for ${t.email} (${count} corsair accounts)`);
  }

  console.log("\n=== backfilling meeting_note.tenant_id ===");

  const [{ count: orphaned }] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM meeting_note
     WHERE tenant_id IS NULL OR tenant_id = ''`;
  console.log(`  notes needing a tenant: ${orphaned}`);

  if (orphaned !== "0") {
    // Match each note to the tenant whose calendar actually holds that event.
    const assigned = await sql`
      UPDATE meeting_note n
         SET tenant_id = a.tenant_id
        FROM corsair_entities e
        JOIN corsair_accounts a ON a.id = e.account_id
       WHERE e.entity_type = 'events'
         AND e.entity_id = n.event_id
         AND (n.tenant_id IS NULL OR n.tenant_id = '')
      `;
    console.log(`  matched to an owning calendar: ${assigned.count}`);

    const [{ count: stillOrphaned }] = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM meeting_note
       WHERE tenant_id IS NULL OR tenant_id = ''`;
    if (stillOrphaned !== "0") {
      console.log(
        `  ${stillOrphaned} note(s) reference an event no tenant has — left unassigned.\n` +
          `  They are unreachable rather than mis-attributed, which is the safe failure.`,
      );
    }
  }

  console.log("\n=== result ===");
  const users = await sql<
    { id: string; email: string; google_sub: string | null; accounts: string }[]
  >`
    SELECT u.id,
           u.email,
           u.google_sub,
           (SELECT COUNT(*)::text FROM corsair_accounts a WHERE a.tenant_id = u.id) AS accounts
      FROM app_user u
     ORDER BY u.id`;
  for (const u of users) {
    console.log(
      `  ${u.id.padEnd(14)} ${u.email.padEnd(34)} claimed=${!!u.google_sub} corsair_accounts=${u.accounts}`,
    );
  }

  const [{ count: notes }] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM meeting_note WHERE tenant_id <> ''`;
  console.log(`\n  meeting_note rows with a tenant: ${notes}`);
  console.log(
    "\nSign in with one of those addresses to claim its tenant and its data.",
  );

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await sql.end().catch(() => {});
});
