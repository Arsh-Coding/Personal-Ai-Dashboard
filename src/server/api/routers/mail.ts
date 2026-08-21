import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { corsairFor, tenantInput, unwrapEntities } from "@/server/corsair";

/** Messages hydrated per `refreshMail` call, and how many requests run at once. */
const HYDRATE_PER_SYNC = 50;
const HYDRATE_CONCURRENCY = 5;

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
      return unwrapEntities(threads);
    } catch (e) {
      console.error("Error fetching threads from corsair db:", e);
      return [];
    }
  }),

  getMessages: publicProcedure.input(tenantInput).query(async ({ input }) => {
    try {
      const messages = await corsairFor(input.tenant).gmail.db.messages.search({});
      // Oldest first, so MailPanel's `threadMessages[length - 1]` is the latest.
      return unwrapEntities(messages).sort(
        (a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0),
      );
    } catch (e) {
      console.error("Error fetching messages from corsair db:", e);
      return [];
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
