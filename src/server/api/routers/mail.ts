import { z } from "zod";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { corsairFor } from "@/server/corsair";
import { extractMailBody, type GmailPart } from "@/server/mailBody";
import {
  BODY_KEYS,
  readEntities,
  readEntity,
  resolveAccountId,
} from "@/server/entityReads";
import { sql } from "@/server/pg";

/**
 * Messages hydrated per `refreshMail` call, and how many requests run at once.
 *
 * Lowered from 50. A sync also pays for `threads.list` and `messages.list`, which
 * Corsair stores one row at a time, and a full run was measured at over 300
 * seconds — longer than any serverless function budget, and long enough that
 * clients time out and retry into a half-finished run. 15 keeps a single call
 * inside a request; the backlog drains over successive syncs, and `remaining`
 * tells the UI to offer another.
 *
 * Properly fixing this means moving the sync to a background job rather than
 * shrinking the batch, because `messages.list` alone is unbounded.
 */
const HYDRATE_PER_SYNC = 15;
const HYDRATE_CONCURRENCY = 5;

/** A sync abandoned before releasing its lock stops blocking the account after this. */
const SYNC_LOCK_STALE_MINUTES = 10;

/**
 * A message as the list view needs it: headers and snippet, no body.
 *
 * Everything but `id` is optional because a row that `messages.list` created but
 * hydration hasn't reached yet carries only `{ id, threadId }` — Gmail returns no
 * headers from any list call.
 */
export type MailListMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  sizeEstimate?: number;
  subject?: string;
  from?: string;
  to?: string;
  /** `corsair_entities` primary key, carried through by the entity reader. */
  _rowId?: string;
};

/** A thread as the list view needs it. */
export type MailListThread = {
  id: string;
  snippet?: string;
  historyId?: string;
  _rowId?: string;
};

/**
 * Drop the MIME tree from a message before it crosses the wire.
 *
 * `payload` holds the entire email body and it dominates these rows — measured at
 * 72-77% of the JSON per tenant, 8.91 MB of personal's 12.31 MB. The list view only
 * needs headers and the snippet, so shipping every body to render one-line previews
 * wasted about three quarters of the transfer on every dashboard load.
 *
 * `getMessageBody` fetches the single body being read instead, which is what makes
 * the reading view cheaper than the status quo rather than more expensive.
 *
 * Built as an allowlist rather than by deleting `payload`. Naming what may leave the
 * server means a field the plugin starts storing later cannot ship to the browser by
 * default — with a denylist, the next body-bearing field added upstream would.
 */
function toListMessage(row: Record<string, unknown>): MailListMessage {
  return {
    id: String(row.id ?? ""),
    threadId: row.threadId as string | undefined,
    labelIds: row.labelIds as string[] | undefined,
    snippet: row.snippet as string | undefined,
    historyId: row.historyId as string | undefined,
    internalDate: row.internalDate as string | undefined,
    sizeEstimate: row.sizeEstimate as number | undefined,
    subject: row.subject as string | undefined,
    from: row.from as string | undefined,
    to: row.to as string | undefined,
    _rowId: row._rowId as string | undefined,
  };
}

/**
 * `newestFirst` and `mergeable` used to live here.
 *
 * Both only existed to do in Node what the database can do in place: ordering the
 * hydration queue is now `ORDER BY length(entity_id) DESC, entity_id DESC`, and
 * merging a snapshot under a fresh stub is now `b.data || e.data`. See `refreshMail`.
 */

export const mailRouter = createTRPCRouter({
  getThreads: tenantProcedure.query(async ({ ctx }) => {
    try {
      const threads = await readEntities({
        tenant: ctx.tenantId,
        plugin: "gmail",
        entityType: "threads",
      });
      return threads as MailListThread[];
    } catch (e) {
      console.error("Error fetching threads from corsair db:", e);
      return [] as MailListThread[];
    }
  }),

  getMessages: tenantProcedure.query(async ({ ctx }) => {
    try {
      // Bodies are stripped inside Postgres rather than after the fact. The
      // `toListMessage` allowlist below already kept them off the wire to the
      // browser, but the rows still had to travel from Neon to get here — 17 MB
      // to render 170 KB of headers.
      const messages = await readEntities({
        tenant: ctx.tenantId,
        plugin: "gmail",
        entityType: "messages",
        omitKeys: BODY_KEYS,
      });
      // Oldest first, so MailPanel's `threadMessages[length - 1]` is the latest.
      // Sorted here rather than in SQL because `internalDate` is absent on
      // unhydrated stubs, and a cast would have to special-case that anyway.
      return messages
        .sort((a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0))
        .map(toListMessage);
    } catch (e) {
      console.error("Error fetching messages from corsair db:", e);
      return [] as MailListMessage[];
    }
  }),

  /**
   * The rendered body of one message, for the "Show full mail" view.
   *
   * A `mutation` rather than a `query` because it may write: hydration is capped at
   * `HYDRATE_PER_SYNC` per sync, so plenty of messages are still stubs carrying only
   * `{ id, threadId }`. Rather than telling the user to go press Sync, fetch that one
   * message on demand — `messages.get` stores the payload as a side effect, so the
   * row is complete afterwards.
   *
   * `findByEntityId` reads the single row instead of `search({})`, which would pull
   * every message and its payload to render one of them.
   */
  getMessageBody: tenantProcedure
    .input(
      z.object({
        messageId: z.string().min(1),
        /**
         * Off by default. Remote images are only requested once the user asks, since
         * loading them tells the sender the mail was opened.
         */
        showImages: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const gmail = corsairFor(ctx.tenantId).gmail;

        const read = () =>
          readEntity({
            tenant: ctx.tenantId,
            plugin: "gmail",
            entityType: "messages",
            entityId: input.messageId,
          });

        let message = await read();

        // Checked before any Gmail call on purpose. An id we have never listed is
        // almost certainly wrong, and asking Gmail for it just earns a 400 whose
        // message ("Bad Request") tells the user nothing.
        if (!message) {
          return { ok: false as const, error: "Message not found" };
        }

        // A row with no payload was created by `messages.list` and never fetched.
        let hydrated = false;
        if (!message.payload) {
          await gmail.api.messages.get({ id: input.messageId });
          hydrated = true;
          message = await read();
        }

        if (!message?.payload) {
          return {
            ok: false as const,
            error: "Gmail returned no body for this message",
          };
        }

        const body = extractMailBody(message.payload as GmailPart, {
          allowImages: input.showImages,
        });

        if (!body) {
          // Neither text/html nor text/plain anywhere in the tree. Every hydrated
          // message on disk has one, so this is a genuinely unusual message rather
          // than an expected branch.
          return {
            ok: false as const,
            error: "No readable body part in this message",
          };
        }

        return {
          ok: true as const,
          kind: body.kind,
          document: body.document,
          blockedImages: body.blockedImages,
          inlineImages: body.inlineImages,
          truncated: body.truncated,
          attachments: body.attachments,
          hydrated,
        };
      } catch (e: unknown) {
        console.error("Error loading Gmail message body:", e);
        return {
          ok: false as const,
          error: e instanceof Error ? e.message : "Failed to load message",
        };
      }
    }),

  refreshMail: tenantProcedure.mutation(async ({ ctx }) => {
    try {
      const gmail = corsairFor(ctx.tenantId).gmail;

      const accountId = await resolveAccountId(ctx.tenantId, "gmail");
      if (!accountId) {
        return { success: false, error: "Gmail is not connected for this account" };
      }

      /**
       * Claim the account's sync lock, or decline.
       *
       * One statement so the check and the claim cannot interleave. The `WHERE` on
       * the conflict path is what makes it a lock rather than a last-writer-wins
       * upsert: an existing row is only taken over once it is stale, so a healthy
       * run in progress returns no row and this call backs off.
       */
      const claimed = await sql<{ account_id: string }[]>`
        INSERT INTO sync_lock (account_id, started_at)
        VALUES (${accountId}, now())
        ON CONFLICT (account_id) DO UPDATE
           SET started_at = now()
         WHERE sync_lock.started_at <
               now() - ${`${SYNC_LOCK_STALE_MINUTES} minutes`}::interval
        RETURNING account_id
      `;
      if (claimed.length === 0) {
        // Not an error: the user pressed Sync twice, or a client timed out and
        // retried while the first run was still going.
        return {
          success: false,
          error: "A sync is already running for this account. Give it a moment.",
        };
      }

      try {
      /**
       * Finish any merge a previous run left owed, before starting a new one.
       *
       * If a sync dies between the stash and the merge — a client timeout that
       * aborts the handler, or a serverless function hitting its wall clock — the
       * clobbered messages stay un-hydrated while their data sits in the buffer.
       * Observed live: an aborted run left jungleworks at 174 of 274 hydrated with
       * all 224 rows still buffered.
       *
       * Recovering here rather than only in a cleanup script means the damage is
       * self-healing: the next sync puts it back. Nothing is lost either way, which
       * is the advantage of the buffer living in Postgres instead of in a Node Map
       * that vanishes with the request.
       */
      const recovered = await sql`
        UPDATE corsair_entities e
           SET data = b.data || e.data,
               updated_at = now()
          FROM sync_restore_buffer b
         WHERE b.account_id = e.account_id
           AND b.entity_id = e.entity_id
           AND e.entity_type = 'messages'
           AND NOT (e.data ? 'subject')
      `;
      if (recovered.count > 0) {
        console.warn(
          `[sync] recovered ${recovered.count} message(s) left by an interrupted sync`,
        );
      }

      /**
       * `messages.list` upserts each stub it gets back over the stored row
       * wholesale, so it wipes subject/from/to/internalDate/payload off every
       * message it returns — a sync would otherwise un-hydrate the newest page of
       * mail every time it runs. So the hydrated fields are stashed first and
       * merged back afterwards.
       *
       * Both halves happen inside Postgres. The previous version pulled every
       * hydrated row into Node to snapshot it (~17 MB) and then wrote the dropped
       * fields back one row at a time (~50 round trips), which cost about 30
       * seconds against a network database and nothing at all against the SQLite
       * file it was written for.
       */
      await sql`DELETE FROM sync_restore_buffer WHERE account_id = ${accountId}`;
      await sql`
        INSERT INTO sync_restore_buffer (account_id, entity_id, data)
        SELECT account_id, entity_id, data
          FROM corsair_entities
         WHERE account_id = ${accountId}
           AND entity_type = 'messages'
           AND data ? 'subject'
      `;

      // `threads.list` stores thread stubs (id, snippet); `messages.list` stores
      // message stubs that are only { id, threadId } — Gmail does not return
      // headers from any list call.
      await gmail.api.threads.list({});
      await gmail.api.messages.list({});

      /**
       * `b.data || e.data` is jsonb concatenation with the right side winning,
       * which is exactly the old `{ ...snapshot, ...freshRow }`: live fields like
       * `labelIds` keep what Gmail just said, and only the keys the stub lacks
       * come from the snapshot.
       *
       * Restricted to rows that actually lost their `subject`, so a message the
       * list call did not touch is never rewritten.
       */
      const restore = await sql`
        UPDATE corsair_entities e
           SET data = b.data || e.data,
               updated_at = now()
          FROM sync_restore_buffer b
         WHERE b.account_id = e.account_id
           AND b.entity_id = e.entity_id
           AND e.entity_type = 'messages'
           AND NOT (e.data ? 'subject')
      `;
      const restored = restore.count;

      await sql`DELETE FROM sync_restore_buffer WHERE account_id = ${accountId}`;

      /**
       * Only `messages.get` fills in subject/from/to, so hydrate the stubs not
       * fetched yet. Bounded per sync to stay inside Gmail's rate limit;
       * subsequent syncs pick up where this one left off.
       *
       * Newest first, and deliberately not in insertion order — otherwise every
       * message discovered after the first sync queues behind the entire backlog,
       * hydration walks backwards in time, and today's mail arrives last.
       *
       * `ORDER BY length(entity_id) DESC, entity_id DESC` is the SQL form of the
       * old `newestFirst` comparator: a Gmail message id is a hex counter that
       * grows with delivery time, so longer ids are larger, and equal-length ones
       * compare lexicographically. Ids only, so this transfers bytes rather than
       * megabytes.
       */
      const pending = await sql<{ entity_id: string }[]>`
        SELECT entity_id
          FROM corsair_entities
         WHERE account_id = ${accountId}
           AND entity_type = 'messages'
           AND NOT (data ? 'subject')
         ORDER BY length(entity_id) DESC, entity_id DESC
         LIMIT ${HYDRATE_PER_SYNC}
      `;

      let hydrated = 0;
      let failed = 0;
      for (let i = 0; i < pending.length; i += HYDRATE_CONCURRENCY) {
        const batch = pending.slice(i, i + HYDRATE_CONCURRENCY);
        const settled = await Promise.allSettled(
          batch.map((m) => gmail.api.messages.get({ id: m.entity_id })),
        );
        hydrated += settled.filter((r) => r.status === "fulfilled").length;
        for (const r of settled) {
          if (r.status === "rejected") {
            failed++;
            console.error("Failed to hydrate Gmail message:", r.reason);
          }
        }
      }

      // Counted after hydrating rather than inferred from the batch size, so the
      // number is the real backlog even when some fetches failed.
      const [{ count: remaining }] = await sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count
          FROM corsair_entities
         WHERE account_id = ${accountId}
           AND entity_type = 'messages'
           AND NOT (data ? 'subject')
      `;

      // `remaining` lets the UI say another sync is worth clicking, instead of
      // leaving a silent backlog behind.
      return {
        success: true,
        restored,
        hydrated,
        failed,
        remaining: Number(remaining),
      };
      } finally {
        /**
         * Released whatever happened, including on the error path. A sync that
         * threw halfway and kept its lock would lock the account out until the
         * staleness window expired.
         *
         * The buffer is cleared here too rather than only on the happy path, so a
         * failed run cannot leave a snapshot behind for the next one to merge in.
         */
        await sql`DELETE FROM sync_restore_buffer WHERE account_id = ${accountId}`
          .catch((e) => console.error("Failed to clear sync buffer:", e));
        await sql`DELETE FROM sync_lock WHERE account_id = ${accountId}`
          .catch((e) => console.error("Failed to release sync lock:", e));
      }
    } catch (e: any) {
      console.error("Error syncing Gmail:", e);
      return { success: false, error: e.message || "Failed to sync Gmail" };
    }
  }),

  sendMessage: tenantProcedure
    .input(
      z.object({
        to: z.email(),
        subject: z.string(),
        body: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const rawMessage = [
          `To: ${input.to}`,
          "Content-Type: text/html; charset=utf-8",
          "MIME-Version: 1.0",
          `Subject: ${input.subject}`,
          "",
          input.body,
        ].join("\r\n");

        const encodedMessage = Buffer.from(rawMessage)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const result = await corsairFor(ctx.tenantId).gmail.api.messages.send({
          raw: encodedMessage,
        });
        return { success: true, result };
      } catch (e: any) {
        console.error("Error sending email via Gmail plugin:", e);
        return { success: false, error: e.message || "Failed to send email" };
      }
    }),
});
