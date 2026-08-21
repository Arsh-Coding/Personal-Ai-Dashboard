import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { meetingNotes } from "@/server/db/schema";

export const notesRouter = createTRPCRouter({
  getNote: publicProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      const note = await ctx.db
        .select()
        .from(meetingNotes)
        .where(eq(meetingNotes.eventId, input.eventId))
        .get();
      return note ?? null;
    }),

  upsertNote: publicProcedure
    .input(
      z.object({
        eventId: z.string(),
        content: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(meetingNotes)
        .where(eq(meetingNotes.eventId, input.eventId))
        .get();

      if (existing) {
        await ctx.db
          .update(meetingNotes)
          .set({ content: input.content, updatedAt: new Date() })
          .where(eq(meetingNotes.eventId, input.eventId));
      } else {
        await ctx.db.insert(meetingNotes).values({
          eventId: input.eventId,
          content: input.content,
        });
      }
      return { success: true };
    }),
});
