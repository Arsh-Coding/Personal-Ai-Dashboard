import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { meetingNotes } from "@/server/db/schema";

/**
 * Notes are now scoped by tenant as well as event.
 *
 * They were addressable by `event_id` alone, which meant anyone who knew or
 * guessed a Google event id could read — and overwrite — another account's note.
 * Invisible while one person owned every account; a cross-user leak the moment
 * sign-in exists. Every query here is filtered by `ctx.tenantId`, which comes from
 * the session and cannot be supplied by the caller.
 */
export const notesRouter = createTRPCRouter({
  getNote: tenantProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      // `.limit(1)` + index rather than `.get()`: that helper is part of Drizzle's
      // SQLite/libsql driver API and does not exist on the postgres-js driver.
      const [note] = await ctx.db
        .select()
        .from(meetingNotes)
        .where(
          and(
            eq(meetingNotes.tenantId, ctx.tenantId),
            eq(meetingNotes.eventId, input.eventId),
          ),
        )
        .limit(1);
      return note ?? null;
    }),

  upsertNote: tenantProcedure
    .input(
      z.object({
        eventId: z.string(),
        content: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      /**
       * One statement, resolved by the database.
       *
       * This replaced a select-then-insert-or-update, which had a race: two saves
       * for the same event could both read "no existing row" and both insert, and
       * the second would then fail on the unique constraint. Over a network
       * connection the window is far wider than it was against a local file.
       *
       * The conflict target is the composite `(tenant_id, event_id)`, since the
       * same event id legitimately appears once per tenant now.
       */
      await ctx.db
        .insert(meetingNotes)
        .values({
          tenantId: ctx.tenantId,
          eventId: input.eventId,
          content: input.content,
        })
        .onConflictDoUpdate({
          target: [meetingNotes.tenantId, meetingNotes.eventId],
          set: { content: input.content, updatedAt: new Date() },
        });
      return { success: true };
    }),
});
