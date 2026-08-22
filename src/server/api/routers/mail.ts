import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { corsairFor, tenantInput, unwrapEntities } from "@/server/corsair";
import { extractMailBody, type GmailPart } from "@/server/mailBody";

/** Messages hydrated per `refreshMail` call, and how many requests run at once. */
const HYDRATE_PER_SYNC = 50;
const HYDRATE_CONCURRENCY = 5;

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
  /** `corsair_entities` primary key, added by `unwrapEntities`. */
  _rowId?: number;
};

/** A thread as the list view needs it. */
export type MailListThread = {
  id: string;
  snippet?: string;
  historyId?: string;
  _rowId?: number;
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
    _rowId: row._rowId as number | undefined,
  };
}

/**
 * Newest message first.
 *
 * A Gmail message id is a hex counter that increases with delivery time, so id
 * order is date order — which matters because stubs carry no `internalDate` to
 * sort on until they're hydrated. Compared as hex magnitude (longer id wins,
 * then lexicographically) rather than numerically, since these overflow a
 * double and the ES2017 target rules out BigInt literals.
 */
function newestFirst(a: any, b: any): number {
  const x = String(a?.id ?? "").toLowerCase();
  const y = String(b?.id ?? "").toLowerCase();
  if (x.length !== y.length) return y.length - x.length;
  return x < y ? 1 : x > y ? -1 : 0;
}

/**
 * An entity payload ready to be merged into another: the `_rowId` this app adds
 * is dropped, and so is every `undefined`, so spreading one row over another can
 * only fill fields in, never blank them out.
 */
function mergeable(row: any): Record<string, unknown> {
  const { _rowId, ...rest } = row ?? {};
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
}

export const mailRouter = createTRPCRouter({
  getThreads: publicProcedure.input(tenantInput).query(async ({ input }) => {
    try {
      const threads = await corsairFor(input.tenant).gmail.db.threads.search({});
      return unwrapEntities(threads) as MailListThread[];
    } catch (e) {
      console.error("Error fetching threads from corsair db:", e);
      return [] as MailListThread[];
    }
  }),

  getMessages: publicProcedure.input(tenantInput).query(async ({ input }) => {
    try {
      const messages = await corsairFor(input.tenant).gmail.db.messages.search({});
      // Oldest first, so MailPanel's `threadMessages[length - 1]` is the latest.
      return unwrapEntities(messages)
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
  getMessageBody: publicProcedure
    .input(
      tenantInput.extend({
        messageId: z.string().min(1),
        /**
         * Off by default. Remote images are only requested once the user asks, since
         * loading them tells the sender the mail was opened.
         */
        showImages: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const gmail = corsairFor(input.tenant).gmail;

        const read = async () => {
          const row = await gmail.db.messages.findByEntityId(input.messageId);
          return row ? unwrapEntities([row])[0] : undefined;
        };

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

  refreshMail: publicProcedure.input(tenantInput).mutation(async ({ input }) => {
    try {
      const gmail = corsairFor(input.tenant).gmail;

      // `messages.list` upserts each stub it gets back over the stored row
      // wholesale, so it wipes subject/from/to/internalDate/payload off every
      // message it returns — a sync would otherwise un-hydrate the newest page
      // of mail every time it runs. Snapshot the hydrated rows first so those
      // fields can be written back below.
      const hydratedBefore = new Map<string, any>(
        unwrapEntities(await gmail.db.messages.search({}))
          .filter((m: any) => m.id && m.subject)
          .map((m: any) => [m.id, m]),
      );

      // `threads.list` stores thread stubs (id, snippet); `messages.list` stores
      // message stubs that are only { id, threadId } — Gmail does not return
      // headers from any list call.
      await gmail.api.threads.list({});
      await gmail.api.messages.list({});

      // Put back what the list call dropped. The freshly listed row is spread
      // last so live fields like `labelIds` keep the values Gmail just gave us;
      // only the fields the stub lacks come from the snapshot. Local writes
      // only — no Gmail quota, so nothing here competes with hydration.
      let restored = 0;
      for (const row of unwrapEntities(await gmail.db.messages.search({}))) {
        if (!row?.id || row.subject) continue;
        const snapshot = hydratedBefore.get(row.id);
        if (!snapshot) continue;
        try {
          await gmail.db.messages.upsertByEntityId(row.id, {
            ...mergeable(snapshot),
            ...mergeable(row),
          } as any);
          restored++;
        } catch (e) {
          console.error("Failed to restore hydrated Gmail message:", row.id, e);
        }
      }

      // Only `messages.get` fills in subject/from/to, so hydrate the stubs we
      // haven't fetched yet. Bounded per sync to stay inside Gmail's rate
      // limit; subsequent syncs pick up where this one left off.
      //
      // Newest first, and deliberately not in `search()` order: that's insertion
      // order, so every message discovered after the first sync queues up behind
      // the entire remaining backlog. Hydration would then walk backwards in
      // time and today's mail would be the last thing to arrive — which is the
      // one thing nobody wants to wait for.
      const unhydrated = unwrapEntities(await gmail.db.messages.search({}))
        .filter((m: any) => m.id && !m.subject)
        .sort(newestFirst);
      const pending = unhydrated.slice(0, HYDRATE_PER_SYNC);

      let hydrated = 0;
      let failed = 0;
      for (let i = 0; i < pending.length; i += HYDRATE_CONCURRENCY) {
        const batch = pending.slice(i, i + HYDRATE_CONCURRENCY);
        const settled = await Promise.allSettled(
          batch.map((m: any) => gmail.api.messages.get({ id: m.id })),
        );
        hydrated += settled.filter((r) => r.status === "fulfilled").length;
        for (const r of settled) {
          if (r.status === "rejected") {
            failed++;
            console.error("Failed to hydrate Gmail message:", r.reason);
          }
        }
      }

      // `remaining` lets the UI say another sync is worth clicking, instead of
      // leaving a silent backlog behind.
      return {
        success: true,
        restored,
        hydrated,
        failed,
        remaining: Math.max(unhydrated.length - hydrated, 0),
      };
    } catch (e: any) {
      console.error("Error syncing Gmail:", e);
      return { success: false, error: e.message || "Failed to sync Gmail" };
    }
  }),

  sendMessage: publicProcedure
    .input(
      tenantInput.extend({
        to: z.email(),
        subject: z.string(),
        body: z.string(),
      })
    )
    .mutation(async ({ input }) => {
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

        const result = await corsairFor(input.tenant).gmail.api.messages.send({
          raw: encodedMessage,
        });
        return { success: true, result };
      } catch (e: any) {
        console.error("Error sending email via Gmail plugin:", e);
        return { success: false, error: e.message || "Failed to send email" };
      }
    }),
});
