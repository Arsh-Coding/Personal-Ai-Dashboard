import {
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Everyone who has signed in.
 *
 * `id` doubles as the Corsair tenant id, so there is no mapping table and no way
 * for the two to drift. It used to be a word typed into `src/lib/tenants.ts`
 * (`"personal"`, `"jungleworks"`, `"finance"`); it is now derived from the Google
 * account that signed in, which is what lets strangers use the app without a
 * redeploy.
 *
 * The three original tenants are seeded into this table by
 * `scripts/seed-legacy-users.ts`, keyed by email, so the migrated mail and calendar
 * data stays reachable once its owner signs in.
 */
export const appUsers = pgTable("app_user", {
  /** Corsair tenant id. `u_<google sub>` for new users; legacy ids kept as-is. */
  id: text("id").primaryKey(),
  /**
   * Google's stable, never-reused account identifier.
   *
   * Null on a seeded row until that account signs in for the first time and
   * claims it — email alone is not a safe permanent key, since Google addresses
   * can in principle change hands, but it is good enough for a one-time claim
   * when `email_verified` is true.
   */
  googleSub: text("google_sub").unique(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

/**
 * Per-event notes, the one piece of state this app owns rather than syncing.
 *
 * Postgres rather than SQLite so it survives a serverless deploy. `serial` replaces
 * SQLite's `integer primary key autoincrement`, and `timestamp` columns are
 * `timestamptz` so a note written from one region reads back correctly in another.
 *
 * `tenant_id` scopes a note to its owner. Without it these were addressable by
 * `event_id` alone, so anyone who knew (or guessed) a Google event id could read
 * another account's notes — harmless with three accounts owned by one person,
 * a cross-user leak as soon as anyone can sign in.
 */
export const meetingNotes = pgTable(
  "meeting_note",
  {
    id: serial("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    eventId: text("event_id").notNull(),
    content: text("content").default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date(),
    ),
  },
  (table) => [
    /**
     * `event_id` alone used to be unique, which is wrong now: the same Google
     * event legitimately appears on two calendars when someone is invited, so two
     * tenants can each hold a note against it. Uniqueness belongs on the pair.
     *
     * Also load-bearing rather than decorative — `upsertNote` targets exactly this
     * constraint, and Postgres rejects `ON CONFLICT` without a matching index.
     */
    uniqueIndex("meeting_note_tenant_event_key").on(table.tenantId, table.eventId),
  ],
);

/**
 * Scratch space that lets the Gmail sync survive its own list call.
 *
 * `messages.list` returns stubs of `{ id, threadId }` and Corsair upserts them
 * over the stored row wholesale, so every sync wipes `subject`, `from`, `to`,
 * `internalDate` and `payload` off the newest page of mail. The sync has always
 * had to put those back.
 *
 * It used to do that by reading every hydrated row into Node before the list call
 * (~17 MB), then writing the dropped fields back one row at a time (~50 round
 * trips at ~266ms each). Both now happen inside Postgres: one `INSERT ... SELECT`
 * to stash, one `UPDATE ... FROM` to merge with `b.data || e.data`, and nothing
 * crosses the network.
 *
 * Transient by design. Rows exist only for the duration of one sync and are
 * cleared at both ends of it, so a crashed sync cannot leave stale data that a
 * later one would merge back in.
 */
export const syncRestoreBuffer = pgTable(
  "sync_restore_buffer",
  {
    accountId: text("account_id").notNull(),
    entityId: text("entity_id").notNull(),
    data: jsonb("data").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.entityId] })],
);

/**
 * One sync at a time per account.
 *
 * Two concurrent syncs for the same account destroy each other. `messages.list`
 * clobbers the same rows both are trying to protect, and they share
 * `sync_restore_buffer`, so the second one's `DELETE` wipes the first one's
 * snapshot and the first one's restore then finds nothing to put back. Observed
 * live: hydrated messages fell from 274 to 189 when a client gave up and retried
 * while the original request was still running.
 *
 * Holding the lock in a table rather than a Postgres advisory lock is deliberate.
 * Advisory locks are scoped to a connection, and this sync spans several Gmail HTTP
 * calls across a pool — keeping one connection (and an open transaction) parked for
 * the duration would be worse than the problem.
 *
 * `started_at` makes the lock self-healing: a run killed before it could release
 * (a crash, or a serverless function hitting its wall clock) would otherwise block
 * the account forever.
 */
export const syncLocks = pgTable("sync_lock", {
  accountId: text("account_id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
});
