import { z } from "zod";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { corsairFor } from "@/server/corsair";
import { readEntities } from "@/server/entityReads";
import { encodeHeaderValue } from "@/server/mime";

/**
 * A Meet space is created standalone and its link is carried on the calendar
 * event, rather than asked for through the event itself.
 *
 * The reason is the googlecalendar plugin: its `events.create` event body has no
 * `conferenceData` field, so there is no way to send Google the
 * `createRequest` that would mint a Hangout link — the key would be dropped
 * before the request left the process. `googlemeet.spaces.create` returns a
 * `meetingUri` directly, so the link is obtained first and then written onto the
 * event as `location` (and into its description), where every calendar client
 * shows it as the place to join, and where `meetLinkOf` can find it again.
 */

/**
 * The most useful sentence available about a failed Google call.
 *
 * Corsair's `ApiError.message` is only the HTTP status text — a bare
 * "Forbidden" — while the sentence that says what to actually do sits in the
 * response body, e.g. "Google Meet API has not been used in project ... before
 * or it is disabled. Enable it by visiting <link>". Preferring the body turns a
 * dead-end error in the UI into an actionable one.
 */
function providerMessage(e: any, fallback: string): string {
  const detail = e?.body?.error?.message;
  if (typeof detail === "string" && detail.trim()) return detail;
  return typeof e?.message === "string" && e.message.trim() ? e.message : fallback;
}

/** Minimal HTML escape — every interpolation below is user-supplied text. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The meeting window written for a human, in the organizer's zone.
 *
 * `timeZone` comes from the browser rather than the server: both start and end
 * arrive as UTC instants, so without it the invite would be rendered in
 * whatever zone the Node process happens to run in.
 */
function formatWhen(startIso: string, endIso: string, timeZone?: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const opts: Intl.DateTimeFormatOptions = { timeZone, dateStyle: "full", timeStyle: "short" };
  const time: Intl.DateTimeFormatOptions = { timeZone, timeStyle: "short" };
  return `${start.toLocaleString(undefined, opts)} – ${end.toLocaleString(undefined, time)}${
    timeZone ? ` (${timeZone})` : ""
  }`;
}

/** RFC 2822 message, base64url encoded the way Gmail's `raw` field wants it. */
function encodeMessage(headers: string[], html: string): string {
  const raw = [...headers, "MIME-Version: 1.0", "Content-Type: text/html; charset=utf-8", "", html].join(
    "\r\n",
  );
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function inviteEmail(opts: {
  summary: string;
  description?: string;
  when: string;
  meetLink: string;
}): string {
  const agenda = opts.description?.trim()
    ? `<p style="margin:0 0 16px;color:#475569;">${escapeHtml(opts.description).replace(/\n/g, "<br/>")}</p>`
    : "";

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;">
  <h2 style="margin:0 0 4px;color:#0f172a;">${escapeHtml(opts.summary)}</h2>
  <p style="margin:0 0 16px;color:#64748b;font-size:14px;">${escapeHtml(opts.when)}</p>
  ${agenda}
  <p style="margin:0 0 8px;">
    <a href="${escapeHtml(opts.meetLink)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Join with Google Meet</a>
  </p>
  <p style="margin:0;color:#64748b;font-size:13px;">Or open this link: <a href="${escapeHtml(opts.meetLink)}">${escapeHtml(opts.meetLink)}</a></p>
</div>`;
}

export const meetRouter = createTRPCRouter({
  /** Meet spaces this account has created, newest rows last. */
  getSpaces: tenantProcedure.query(async ({ ctx }) => {
    try {
      return await readEntities({
        tenant: ctx.tenantId,
        plugin: "googlemeet",
        entityType: "spaces",
      });
    } catch (e) {
      console.error("Error fetching Meet spaces from corsair db:", e);
      return [];
    }
  }),

  /**
   * The whole flow in one call: mint a Meet space, put it on the calendar with
   * the invitee attached, then email that invitee the link.
   *
   * Each step is reported separately because they fail independently and the
   * consequences differ. Space and event creation are fail-fast — without a
   * link there is nothing to invite anyone to, and without an event there is no
   * meeting to announce. A failed *email*, though, leaves a perfectly good
   * meeting on both calendars, so it downgrades to a warning the UI can show
   * rather than throwing away the work.
   */
  scheduleMeeting: tenantProcedure
    .input(
      z.object({
        summary: z.string().min(1),
        description: z.string().optional(),
        startDateTime: z.string(),
        endDateTime: z.string(),
        attendeeEmail: z.email(),
        /** IANA zone of the browser that picked the times. */
        timeZone: z.string().optional(),
        /** `true` lets anyone holding the link in without knocking. */
        openAccess: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const client = corsairFor(ctx.tenantId);
      const failed = (error: string) => ({ success: false as const, error });

      // 1. The Meet space. `TRUSTED` is Google's own default: signed-in guests
      // knock and the host admits them. `OPEN` trades that for a link anyone
      // can walk through, which is the only thing that works when the invitee
      // has no Google account.
      let meetLink: string;
      let spaceName: string | undefined;
      try {
        const space = await client.googlemeet.api.spaces.create({
          space: { config: { accessType: input.openAccess ? "OPEN" : "TRUSTED" } },
        });
        if (!space?.meetingUri) {
          return failed("Google Meet did not return a meeting link");
        }
        meetLink = space.meetingUri;
        spaceName = space.name;
      } catch (e: any) {
        console.error("Error creating Google Meet space:", e);
        return failed(providerMessage(e, "Failed to create the Google Meet link"));
      }

      // 2. The calendar event. `sendUpdates: "all"` is what actually puts the
      // meeting on the invitee's calendar — the email in step 3 is a covering
      // note, not a substitute for the invitation.
      const when = formatWhen(input.startDateTime, input.endDateTime, input.timeZone);
      const description = [input.description?.trim(), `Join with Google Meet: ${meetLink}`]
        .filter(Boolean)
        .join("\n\n");

      let event: any;
      try {
        event = await client.googlecalendar.api.events.create({
          event: {
            summary: input.summary,
            description,
            location: meetLink,
            start: { dateTime: input.startDateTime, timeZone: input.timeZone },
            end: { dateTime: input.endDateTime, timeZone: input.timeZone },
            attendees: [{ email: input.attendeeEmail }],
          },
          sendUpdates: "all",
        });
      } catch (e: any) {
        console.error("Error creating calendar event for Meet:", e);
        // Surface the link even so: the space exists and is usable, so the user
        // can still share it by hand instead of losing it to a failed write.
        return {
          ...failed(providerMessage(e, "Failed to schedule the calendar event")),
          meetLink,
        };
      }

      // 3. The invite mail. Past this point the meeting is real, so nothing
      // below may turn the result into a failure.
      let emailSent = false;
      let emailError: string | undefined;
      try {
        const raw = encodeMessage(
          [
            `To: ${input.attendeeEmail}`,
            `Subject: ${encodeHeaderValue(`Invitation: ${input.summary} — ${when}`)}`,
          ],
          inviteEmail({
            summary: input.summary,
            description: input.description,
            when,
            meetLink,
          }),
        );
        await client.gmail.api.messages.send({ raw });
        emailSent = true;
      } catch (e: any) {
        console.error("Error emailing the Google Meet invite:", e);
        emailError = providerMessage(e, "Failed to send the invite email");
      }

      return {
        success: true as const,
        meetLink,
        spaceName,
        eventId: event?.id as string | undefined,
        htmlLink: event?.htmlLink as string | undefined,
        attendeeEmail: input.attendeeEmail,
        emailSent,
        emailError,
      };
    }),
});
