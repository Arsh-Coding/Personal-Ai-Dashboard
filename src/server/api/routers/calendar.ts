import { z } from "zod";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { corsairFor } from "@/server/corsair";
import { readEntities } from "@/server/entityReads";
import type { TenantId } from "@/lib/tenants";

/**
 * The parts of a Google calendar event this app reads.
 *
 * Declared rather than left as `any` because `getTodayStats` hands `nextMeeting`
 * straight to the dashboard, which reads `summary` and `start.dateTime` — with an
 * untyped row those became `{}` across the tRPC boundary and stopped being
 * renderable. Everything is optional: an all-day event has `start.date` and no
 * `start.dateTime`, and a stub has neither.
 */
export type CalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
  _rowId?: string;
};

/** Start of a calendar event, whether it's timed (`dateTime`) or all-day (`date`). */
function eventStart(evt: CalendarEvent): number {
  const raw = evt?.start?.dateTime ?? evt?.start?.date;
  const ms = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Calendar events for one account.
 *
 * Via the projected reader rather than Corsair's ORM, mainly to skip the
 * `SELECT *` and the extra round trip the ORM spends resolving the account. Events
 * carry no body-sized field, so there is nothing worth omitting from the jsonb.
 */
async function readCalendarEvents(tenant: TenantId): Promise<CalendarEvent[]> {
  const rows = await readEntities({
    tenant,
    plugin: "googlecalendar",
    entityType: "events",
  });
  return rows as CalendarEvent[];
}

export const calendarRouter = createTRPCRouter({
  getEvents: tenantProcedure.query(async ({ ctx }) => {
    try {
      const events = await readCalendarEvents(ctx.tenantId);
      // The UI renders these as an "Upcoming Agenda", so order chronologically
      // rather than by whatever order the entities table returns.
      return events.sort((a, b) => eventStart(a) - eventStart(b));
    } catch (e) {
      console.error("Error fetching events from corsair db:", e);
      return [];
    }
  }),

  getTodayStats: tenantProcedure.query(async ({ ctx }) => {
    try {
      const events = await readCalendarEvents(ctx.tenantId);
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const todayEvents = events.filter((evt) => {
        const start = eventStart(evt);
        return start >= startOfToday.getTime() && start <= endOfToday.getTime();
      });

      const nextMeeting =
        events
          .filter((evt) => eventStart(evt) > now.getTime())
          .sort((a, b) => eventStart(a) - eventStart(b))[0] ?? null;

      let hoursBlocked = 0;
      todayEvents.forEach((evt) => {
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
    } catch {
      return {
        todayCount: 0,
        totalCount: 0,
        nextMeeting: null,
        hoursBlocked: 0,
      };
    }
  }),

  refreshEvents: tenantProcedure.mutation(async ({ ctx }) => {
    try {
      await corsairFor(ctx.tenantId).googlecalendar.api.events.getMany({});
      return { success: true };
    } catch (e: any) {
      console.error("Error syncing Google Calendar events:", e);
      return { success: false, error: e.message || "Failed to sync calendar" };
    }
  }),

  createEvent: tenantProcedure
    .input(
      z.object({
        summary: z.string().min(1),
        description: z.string().optional(),
        startDateTime: z.string(),
        endDateTime: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await corsairFor(ctx.tenantId).googlecalendar.api.events.create({
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
