import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { corsairFor, tenantInput, unwrapEntities } from "@/server/corsair";

/** Start of a calendar event, whether it's timed (`dateTime`) or all-day (`date`). */
function eventStart(evt: any): number {
  const raw = evt?.start?.dateTime ?? evt?.start?.date;
  const ms = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

export const calendarRouter = createTRPCRouter({
  getEvents: publicProcedure.input(tenantInput).query(async ({ input }) => {
    try {
      const events = await corsairFor(input.tenant).googlecalendar.db.events.search({});
      // The UI renders these as an "Upcoming Agenda", so order chronologically
      // rather than by whatever order the entities table returns.
      return unwrapEntities(events).sort((a, b) => eventStart(a) - eventStart(b));
    } catch (e) {
      console.error("Error fetching events from corsair db:", e);
      return [];
    }
  }),

  getTodayStats: publicProcedure.input(tenantInput).query(async ({ input }) => {
    try {
      const events = unwrapEntities(
        await corsairFor(input.tenant).googlecalendar.db.events.search({}),
      );
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const todayEvents = events.filter((evt: any) => {
        const start = eventStart(evt);
        return start >= startOfToday.getTime() && start <= endOfToday.getTime();
      });

      const nextMeeting =
        events
          .filter((evt: any) => eventStart(evt) > now.getTime())
          .sort((a: any, b: any) => eventStart(a) - eventStart(b))[0] ?? null;

      let hoursBlocked = 0;
      todayEvents.forEach((evt: any) => {
        if (evt.start?.dateTime && evt.end?.dateTime) {
          const durationMs = new Date(evt.end.dateTime).getTime() - new Date(evt.start.dateTime).getTime();
          hoursBlocked += durationMs / (1000 * 60 * 60);
        }
      });

      return {
        todayCount: todayEvents.length,
        totalCount: events.length,
        nextMeeting,
        hoursBlocked: Math.round(hoursBlocked * 10) / 10,
      };
    } catch (e) {
      return {
        todayCount: 0,
        totalCount: 0,
        nextMeeting: null,
        hoursBlocked: 0,
      };
    }
  }),

  refreshEvents: publicProcedure.input(tenantInput).mutation(async ({ input }) => {
    try {
      await corsairFor(input.tenant).googlecalendar.api.events.getMany({});
      return { success: true };
    } catch (e: any) {
      console.error("Error syncing Google Calendar events:", e);
      return { success: false, error: e.message || "Failed to sync calendar" };
    }
  }),

  createEvent: publicProcedure
    .input(
      tenantInput.extend({
        summary: z.string().min(1),
        description: z.string().optional(),
        startDateTime: z.string(),
        endDateTime: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await corsairFor(input.tenant).googlecalendar.api.events.create({
          event: {
            summary: input.summary,
            description: input.description,
            start: { dateTime: input.startDateTime },
            end: { dateTime: input.endDateTime },
          },
        });
        return { success: true, result };
      } catch (e: any) {
        console.error("Error creating Google Calendar event:", e);
        return { success: false, error: e.message || "Failed to create event" };
      }
    }),
});
