/**
 * Reading a Meet link back off a calendar event.
 *
 * Lives here rather than beside the meet router because `EventCard` needs it
 * too, and that router pulls in `@/server/corsair` — and therefore
 * better-sqlite3 — which cannot be bundled into a client component.
 *
 * Safe to import from client components: no server-only dependencies.
 */
const MEET_LINK_PATTERN = /https:\/\/meet\.google\.com\/[a-z0-9-]+/i;

/**
 * Whichever field of an event carries its Meet link, if any.
 *
 * `hangoutLink` is checked first because Google sets it on events that were
 * given real `conferenceData` — invitations arriving from elsewhere. Events
 * this app schedules carry the link in `location`, and older or hand-edited
 * ones may only mention it in the description.
 */
export function meetLinkOf(evt: unknown): string | null {
  const event = evt as { hangoutLink?: unknown; location?: unknown; description?: unknown };

  if (typeof event?.hangoutLink === "string" && event.hangoutLink) {
    return event.hangoutLink;
  }
  for (const field of [event?.location, event?.description]) {
    const found = typeof field === "string" ? MEET_LINK_PATTERN.exec(field) : null;
    if (found) return found[0];
  }
  return null;
}
