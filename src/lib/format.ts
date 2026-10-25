/**
 * Dates, senders and labels as the dashboard displays them.
 *
 * All of it runs in the browser, in the user's own time zone. That matters for
 * "today": the server runs in UTC, so a day boundary computed there is wrong
 * for everyone else.
 *
 * Safe to import from client components: no server-only dependencies.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type EventTime = { dateTime?: string; date?: string };
type TimedEvent = { start?: EventTime; end?: EventTime };

/**
 * `YYYY-MM-DD` as local midnight. `new Date("2026-10-25")` would parse it as
 * UTC midnight, which is the previous evening anywhere west of Greenwich.
 */
function parseDateOnly(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return new Date(value).getTime();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

function parseEventTime(time?: EventTime): number {
  if (time?.dateTime) return new Date(time.dateTime).getTime();
  if (time?.date) return parseDateOnly(time.date);
  return NaN;
}

/** Start in ms, or `NaN` for a stub with no time at all. */
export function eventStartMs(evt: TimedEvent): number {
  return parseEventTime(evt.start);
}

/**
 * End in ms. Falls back to the start for events with no end, so duration math
 * never goes negative. All-day ends are exclusive (the next midnight), which is
 * exactly what "is it still on?" checks want.
 */
export function eventEndMs(evt: TimedEvent): number {
  const end = parseEventTime(evt.end);
  return Number.isNaN(end) ? eventStartMs(evt) : end;
}

export function isAllDay(evt: TimedEvent): boolean {
  return !evt.start?.dateTime && !!evt.start?.date;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Stable per local calendar day, for grouping. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** "Today", "Tomorrow", "Yesterday", else "Wednesday, Oct 28" (year if not this one). */
export function dayLabel(ms: number, now: number): string {
  const diff = Math.round((startOfDay(ms) - startOfDay(now)) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
  return new Date(ms).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "in 5 min", "in 2 h 10 min", "in 3 days", "12 min ago". */
export function relativeTime(ms: number, now: number): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  let text: string;
  if (abs < MINUTE) return diff >= 0 ? "in under a minute" : "just now";
  if (abs < HOUR) text = `${Math.round(abs / MINUTE)} min`;
  else if (abs < DAY) {
    const h = Math.floor(abs / HOUR);
    const m = Math.round((abs % HOUR) / MINUTE);
    text = m && h < 6 ? `${h} h ${m} min` : `${Math.round(abs / HOUR)} h`;
  } else {
    const d = Math.round(abs / DAY);
    text = `${d} day${d === 1 ? "" : "s"}`;
  }
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

/** Inbox-style: a time today, "Yesterday", a weekday this week, else a date. */
export function mailDateLabel(ms: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
  if (days <= 0) return timeLabel(ms);
  if (days === 1) return "Yesterday";
  if (days < 7) return new Date(ms).toLocaleDateString([], { weekday: "short" });
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
  return new Date(ms).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function greeting(now: number): string {
  const hour = new Date(now).getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** `"Ravi Kumar" <ravi@x.com>` to its parts. A bare address names itself. */
export function parseSender(from?: string): { name: string; email: string } {
  if (!from) return { name: "Unknown sender", email: "" };
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  if (m) {
    const email = m[2].trim();
    return { name: m[1].trim() || email, email };
  }
  return { name: from.trim(), email: from.trim() };
}

export function initials(name: string): string {
  // A character range rather than `\p{L}`, which the ES2017 target rules out.
  const words = name
    .replace(/[^A-Za-z0-9À-￿\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Small, stable hash for picking a color per sender or event title. */
export function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** A `<input type="date">` value for a local day. */
export function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `"09:30"` plus minutes, as `"HH:MM"`, clamped to the same day. */
export function addMinutesToTime(time: string, minutes: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const total = Math.min(Number(m[1]) * 60 + Number(m[2]) + minutes, 23 * 60 + 59);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
