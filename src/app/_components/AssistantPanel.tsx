"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/trpc/react";
import type { AssistantMessage, AssistantOutcome } from "@/lib/assistantTools";

/**
 * A chat panel that drafts emails and schedules Meet calls.
 *
 * The model only ever proposes. Each proposal arrives as a tool call with no
 * server-side `execute`, and is rendered here as an editable card. The card's
 * button is the only thing that calls `mail.sendMessage` or
 * `meet.scheduleMeeting`, the same Corsair-backed mutations the Compose and New
 * Meeting modals use. Pressing it, or Cancel, records the outcome with
 * `addToolOutput` so the model knows what happened on the next turn.
 */

type Part = AssistantMessage["parts"][number];
type EmailPart = Extract<Part, { type: "tool-draftEmail" }>;
type MeetingPart = Extract<Part, { type: "tool-scheduleMeeting" }>;

const EXAMPLES = [
  "Email ravi@example.com that I'll be 10 minutes late to standup",
  "Set up a 30-minute Meet with ravi@example.com tomorrow at 3pm about the launch",
];

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const panelId = useId();
  const inputId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [transport] = useState(
    () => new DefaultChatTransport<AssistantMessage>({ api: "/api/chat" }),
  );
  const { messages, sendMessage, addToolOutput, status, error, stop, setMessages, clearError } =
    useChat<AssistantMessage>({ transport });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, status]);

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    // The time zone goes with every request rather than being set once, so
    // "tomorrow at 3pm" always means the user's tomorrow.
    void sendMessage(
      { text },
      { body: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } },
    );
    setInput("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="fixed right-6 bottom-6 z-40 rounded-full bg-linear-to-r from-purple-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-600/30 hover:from-purple-500 hover:to-indigo-500 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
      >
        {open ? "Close assistant" : "✨ Assistant"}
      </button>

      {open && (
        <section
          id={panelId}
          role="dialog"
          aria-label="Assistant"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          className="fixed right-6 bottom-20 z-40 flex h-[34rem] max-h-[calc(100vh-7rem)] w-[26rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl backdrop-blur-xl"
        >
          <header className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Assistant</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Drafts emails and schedules Meet calls. Nothing is sent until you confirm.
              </p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  stop();
                  clearError();
                  setMessages([]);
                }}
                className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
              >
                Clear
              </button>
            )}
          </header>

          <div ref={scrollRef} aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Try something like:</p>
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setInput(example)}
                    className="block w-full rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-left text-xs text-slate-300 hover:border-indigo-500/60"
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}

            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-3 py-2 text-sm whitespace-pre-wrap text-white">
                    {message.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
                  </p>
                </div>
              ) : (
                <div key={message.id} className="space-y-2">
                  {message.parts.map((part, i) => {
                    const key = `${message.id}-${i}`;
                    if (part.type === "text") {
                      return part.text.trim() ? (
                        <p key={key} className="text-sm whitespace-pre-wrap text-slate-200">
                          {part.text}
                        </p>
                      ) : null;
                    }
                    if (part.type === "tool-draftEmail") {
                      return (
                        <EmailCard
                          key={part.toolCallId}
                          part={part}
                          onOutcome={(output) =>
                            addToolOutput({ tool: "draftEmail", toolCallId: part.toolCallId, output })
                          }
                        />
                      );
                    }
                    if (part.type === "tool-scheduleMeeting") {
                      return (
                        <MeetingCard
                          key={part.toolCallId}
                          part={part}
                          onOutcome={(output) =>
                            addToolOutput({ tool: "scheduleMeeting", toolCallId: part.toolCallId, output })
                          }
                        />
                      );
                    }
                    return null;
                  })}
                </div>
              ),
            )}

            {status === "submitted" && <p className="text-xs text-slate-500">Thinking…</p>}

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300"
              >
                {error.message}
                <button type="button" onClick={clearError} className="ml-2 underline">
                  Dismiss
                </button>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-end gap-2 border-t border-slate-800 p-3"
          >
            <label htmlFor={inputId} className="sr-only">
              Message the assistant
            </label>
            <textarea
              id={inputId}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Draft an email or schedule a meeting…"
              className="flex-1 resize-none rounded-lg border border-slate-800 bg-slate-950 p-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            />
            {busy ? (
              <button
                type="button"
                onClick={() => stop()}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Send
              </button>
            )}
          </form>
        </section>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Cards                                                                       */
/* -------------------------------------------------------------------------- */

function CardShell({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
      <div className="text-xs font-semibold text-slate-200">{title}</div>
      {children}
    </div>
  );
}

function OutcomeLine({ outcome }: { outcome: AssistantOutcome }) {
  const done = outcome.status !== "cancelled";
  return (
    <div
      className={`rounded-xl border p-3 text-xs ${
        done
          ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-300"
          : "border-slate-800 bg-slate-950/50 text-slate-400"
      }`}
    >
      {done ? "✓ " : ""}
      {outcome.note}
      {outcome.meetLink && (
        <a
          href={outcome.meetLink}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block break-all font-medium text-indigo-400 hover:text-indigo-300"
        >
          {outcome.meetLink}
        </a>
      )}
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <div role="alert" className="rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
      {text}
    </div>
  );
}

/** Plain text in, the HTML `mail.sendMessage` sends: escaped, with line breaks kept. */
function plainTextToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r?\n/g, "<br/>");
}

function EmailCard({
  part,
  onOutcome,
}: {
  part: EmailPart;
  onOutcome: (outcome: AssistantOutcome) => void;
}) {
  switch (part.state) {
    case "input-streaming":
      return <CardShell title="Drafting email…" />;
    case "input-available":
      return <EmailForm input={part.input} onOutcome={onOutcome} />;
    case "output-available":
      return <OutcomeLine outcome={part.output} />;
    case "output-error":
      return <ErrorLine text={part.errorText} />;
    default:
      return null;
  }
}

function EmailForm({
  input,
  onOutcome,
}: {
  input: { to: string; subject: string; body: string };
  onOutcome: (outcome: AssistantOutcome) => void;
}) {
  const [to, setTo] = useState(input.to);
  const [subject, setSubject] = useState(input.subject);
  const [body, setBody] = useState(input.body);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  const send = api.mail.sendMessage.useMutation({
    onSuccess: (res) => {
      if (!res.success) {
        setError(res.error ?? "Failed to send email");
        return;
      }
      onOutcome({ status: "sent", note: `Sent to ${to}: "${subject.trim()}"` });
    },
    onError: (e) => setError(e.message),
  });

  const valid = EMAIL_PATTERN.test(to.trim()) && subject.trim() !== "" && body.trim() !== "";

  return (
    <CardShell title="Review email">
      <div className="mt-2 space-y-2">
        <div>
          <label htmlFor={`${ids}-to`} className="block text-[11px] text-slate-400">
            To
          </label>
          <input
            id={`${ids}-to`}
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-subject`} className="block text-[11px] text-slate-400">
            Subject
          </label>
          <input
            id={`${ids}-subject`}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-body`} className="block text-[11px] text-slate-400">
            Message
          </label>
          <textarea
            id={`${ids}-body`}
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={send.isPending}
          onClick={() => onOutcome({ status: "cancelled", note: "Cancelled. Nothing was sent." })}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!valid || send.isPending}
          onClick={() => {
            setError(null);
            send.mutate({ to: to.trim(), subject: subject.trim(), body: plainTextToHtml(body) });
          }}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {send.isPending ? "Sending…" : "Send"}
        </button>
      </div>
    </CardShell>
  );
}

function MeetingCard({
  part,
  onOutcome,
}: {
  part: MeetingPart;
  onOutcome: (outcome: AssistantOutcome) => void;
}) {
  switch (part.state) {
    case "input-streaming":
      return <CardShell title="Preparing meeting…" />;
    case "input-available":
      return <MeetingForm input={part.input} onOutcome={onOutcome} />;
    case "output-available":
      return <OutcomeLine outcome={part.output} />;
    case "output-error":
      return <ErrorLine text={part.errorText} />;
    default:
      return null;
  }
}

/** "9:05" or "09:05" to "09:05"; anything else left for the user to fix. */
function normaliseTime(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : value;
}

function MeetingForm({
  input,
  onOutcome,
}: {
  input: {
    summary: string;
    description?: string;
    date: string;
    startTime: string;
    durationMinutes: number;
    attendeeEmail: string;
  };
  onOutcome: (outcome: AssistantOutcome) => void;
}) {
  const [summary, setSummary] = useState(input.summary);
  const [description, setDescription] = useState(input.description ?? "");
  const [date, setDate] = useState(input.date);
  const [startTime, setStartTime] = useState(normaliseTime(input.startTime));
  const [duration, setDuration] = useState(
    Number.isFinite(input.durationMinutes) && input.durationMinutes > 0 ? input.durationMinutes : 30,
  );
  const [attendeeEmail, setAttendeeEmail] = useState(input.attendeeEmail);
  const [openAccess, setOpenAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  const utils = api.useUtils();

  // Built from the browser's clock, exactly like the New Meeting modal, so the
  // model never has to do time-zone arithmetic.
  const start = new Date(`${date}T${startTime}:00`);
  const startValid = !Number.isNaN(start.getTime());
  const end = new Date(start.getTime() + duration * 60_000);
  const durationValid = Number.isInteger(duration) && duration >= 5 && duration <= 480;

  const valid =
    summary.trim() !== "" &&
    EMAIL_PATTERN.test(attendeeEmail.trim()) &&
    startValid &&
    durationValid;

  const schedule = api.meet.scheduleMeeting.useMutation({
    onSuccess: (res) => {
      if (!res.success) {
        // The calendar step can fail after the Meet space already exists; the
        // router hands the link back on that path so it isn't lost.
        setError(
          "meetLink" in res && res.meetLink
            ? `${res.error}. A Meet link was still created: ${res.meetLink}`
            : res.error,
        );
        return;
      }
      void utils.calendar.getEvents.invalidate();
      void utils.calendar.getTodayStats.invalidate();
      onOutcome({
        status: "scheduled",
        meetLink: res.meetLink,
        note: res.emailSent
          ? `Scheduled "${summary.trim()}" with ${res.attendeeEmail}. Calendar invite and email sent.`
          : `Scheduled "${summary.trim()}" with ${res.attendeeEmail}. The calendar invite went out, but the follow-up email failed${
              res.emailError ? `: ${res.emailError}` : ""
            }. Share the link by hand.`,
      });
    },
    onError: (e) => setError(e.message),
  });

  return (
    <CardShell title="Review meeting">
      <div className="mt-2 space-y-2">
        <div>
          <label htmlFor={`${ids}-summary`} className="block text-[11px] text-slate-400">
            Title
          </label>
          <input
            id={`${ids}-summary`}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-email`} className="block text-[11px] text-slate-400">
            Invitee email
          </label>
          <input
            id={`${ids}-email`}
            type="email"
            value={attendeeEmail}
            onChange={(e) => setAttendeeEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-3 sm:col-span-1">
            <label htmlFor={`${ids}-date`} className="block text-[11px] text-slate-400">
              Date
            </label>
            <input
              id={`${ids}-date`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-time`} className="block text-[11px] text-slate-400">
              Start
            </label>
            <input
              id={`${ids}-time`}
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-duration`} className="block text-[11px] text-slate-400">
              Minutes
            </label>
            <input
              id={`${ids}-duration`}
              type="number"
              min={5}
              max={480}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${ids}-desc`} className="block text-[11px] text-slate-400">
            Agenda (optional)
          </label>
          <textarea
            id={`${ids}-desc`}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
          <input
            type="checkbox"
            checked={openAccess}
            onChange={(e) => setOpenAccess(e.target.checked)}
            className="h-3.5 w-3.5 accent-indigo-600"
          />
          Anyone with the link can join without knocking
        </label>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        {startValid
          ? `${start.toLocaleString([], { dateStyle: "full", timeStyle: "short" })} – ${end.toLocaleTimeString([], { timeStyle: "short" })}`
          : "Pick a valid date and start time."}
      </p>
      {!durationValid && (
        <p className="text-[11px] text-amber-300">Length must be between 5 and 480 minutes.</p>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={schedule.isPending}
          onClick={() => onOutcome({ status: "cancelled", note: "Cancelled. Nothing was scheduled." })}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!valid || schedule.isPending}
          onClick={() => {
            // Checked on click rather than during render: the clock moves, and a
            // card can sit open for a while before anyone presses the button.
            if (start.getTime() < Date.now()) {
              setError("That time has already passed. Pick a later one.");
              return;
            }
            setError(null);
            schedule.mutate({
              summary: summary.trim(),
              description: description.trim() || undefined,
              startDateTime: start.toISOString(),
              endDateTime: end.toISOString(),
              attendeeEmail: attendeeEmail.trim(),
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              openAccess,
            });
          }}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {schedule.isPending ? "Scheduling…" : "Schedule & send invite"}
        </button>
      </div>
    </CardShell>
  );
}
