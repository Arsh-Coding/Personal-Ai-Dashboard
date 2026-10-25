"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/trpc/react";
import type { AssistantMessage, AssistantOutcome } from "@/lib/assistantTools";
import { usePresence } from "./hooks";
import { Spinner } from "./primitives";
import {
  AlertCircleIcon,
  CalendarIcon,
  CheckCircleIcon,
  MailIcon,
  ResetIcon,
  SendIcon,
  SparklesIcon,
  StopIcon,
  VideoIcon,
  XIcon,
} from "./icons";

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
  {
    icon: MailIcon,
    text: "Email ravi@example.com that I'll be 10 minutes late to standup",
  },
  {
    icon: VideoIcon,
    text: "Set up a 30-minute Meet with ravi@example.com tomorrow at 3pm about the launch",
  },
];

const inputClass = "input mt-1 px-2.5 py-1.5 text-[13px]";
const labelClass = "block text-[11px] font-medium text-fg-subtle";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AssistantPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssistantPanel({ open, onOpenChange }: AssistantPanelProps) {
  const [input, setInput] = useState("");
  const panelId = useId();
  const inputId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { mounted, closing } = usePresence(open, 200);

  const [transport] = useState(
    () => new DefaultChatTransport<AssistantMessage>({ api: "/api/chat" }),
  );
  const { messages, sendMessage, addToolOutput, status, error, stop, setMessages, clearError } =
    useChat<AssistantMessage>({ transport });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  // Ready to type the moment it opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Ctrl/Cmd + K toggles the panel from anywhere on the dashboard.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

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
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close assistant" : "Open assistant"}
        title="Assistant (Ctrl+K)"
        className={`fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-linear-to-r from-brand via-fuchsia-500 to-brand-2 bg-[length:200%_auto] p-3.5 text-sm font-semibold text-white transition-all duration-300 hover:scale-105 active:scale-95 sm:right-6 sm:bottom-6 sm:px-5 sm:py-3 ${
          open ? "shadow-pop" : "animate-glow"
        }`}
      >
        <span className="relative size-5">
          <SparklesIcon
            className={`absolute inset-0 size-5 transition-all duration-300 ${open ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"}`}
          />
          <XIcon
            className={`absolute inset-0 size-5 transition-all duration-300 ${open ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0"}`}
          />
        </span>
        <span className="hidden sm:inline">{open ? "Close" : "Ask AI"}</span>
      </button>

      {mounted && (
        <section
          id={panelId}
          role="dialog"
          aria-label="Assistant"
          onKeyDown={(e) => {
            if (e.key === "Escape") onOpenChange(false);
          }}
          className={`fixed inset-x-3 bottom-20 z-40 flex h-[36rem] max-h-[calc(100dvh-7rem)] origin-bottom-right flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-pop sm:inset-x-auto sm:right-6 sm:bottom-24 sm:w-[27rem] ${
            closing ? "pointer-events-none animate-panel-out" : "animate-panel-in"
          }`}
        >
          <header className="relative flex items-center gap-3 overflow-hidden border-b border-line p-4">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 -right-10 size-40 rounded-full bg-brand/20 blur-3xl"
            />
            <div className="relative flex size-10 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-brand via-fuchsia-500 to-brand-2 text-white shadow-[0_8px_20px_-8px_var(--ui-brand)]">
              <SparklesIcon className="size-5" />
            </div>
            <div className="relative min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-fg">Assistant</h2>
              <p className="mt-0.5 text-[11px] leading-snug text-fg-subtle">
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
                aria-label="Clear conversation"
                title="Clear conversation"
                className="btn btn-ghost btn-sm btn-icon relative"
              >
                <ResetIcon className="size-3.5" />
              </button>
            )}
          </header>

          <div ref={scrollRef} aria-live="polite" className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full animate-fade-in flex-col justify-center">
                <div className="text-center">
                  <p className="text-lg font-semibold tracking-tight text-fg">
                    How can I <span className="text-gradient">help</span>?
                  </p>
                  <p className="mt-1 text-xs text-fg-subtle">Try one of these, or ask in your own words.</p>
                </div>
                <div className="mt-5 space-y-2">
                  {EXAMPLES.map(({ icon: Icon, text }, i) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => {
                        setInput(text);
                        inputRef.current?.focus();
                      }}
                      style={{ animationDelay: `${120 + i * 70}ms` }}
                      className="group flex w-full animate-fade-up items-start gap-3 rounded-2xl border border-line bg-surface-2/60 p-3 text-left text-xs leading-relaxed text-fg-muted transition hover:-translate-y-0.5 hover:border-brand/40 hover:bg-surface-2 hover:text-fg"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface text-brand-text ring-1 ring-line transition group-hover:ring-brand/30">
                        <Icon className="size-3.5" />
                      </span>
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex animate-fade-up justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-linear-to-br from-brand to-brand-2 px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-white shadow-[0_6px_16px_-8px_var(--ui-brand)]">
                    {message.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
                  </p>
                </div>
              ) : (
                <div key={message.id} className="flex animate-fade-up gap-2.5">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand-text ring-1 ring-brand/20">
                    <SparklesIcon className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    {message.parts.map((part, i) => {
                      const key = `${message.id}-${i}`;
                      if (part.type === "text") {
                        return part.text.trim() ? (
                          <p key={key} className="text-[13px] leading-relaxed whitespace-pre-wrap text-fg">
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
                </div>
              ),
            )}

            {status === "submitted" && (
              <div className="flex animate-fade-in items-center gap-2.5" aria-label="Thinking">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand-text ring-1 ring-brand/20">
                  <SparklesIcon className="size-3.5" />
                </div>
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-3">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 animate-typing rounded-full bg-fg-subtle"
                      style={{ animationDelay: `${i * 160}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="alert alert-danger animate-fade-in">
                <AlertCircleIcon className="mt-px size-4" />
                <span className="flex-1">
                  {error.message}
                  <button type="button" onClick={clearError} className="ml-2 font-medium underline">
                    Dismiss
                  </button>
                </span>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="border-t border-line p-3"
          >
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface-2 p-1.5 pl-3 transition focus-within:border-brand focus-within:bg-surface focus-within:ring-4 focus-within:ring-brand/15">
              <label htmlFor={inputId} className="sr-only">
                Message the assistant
              </label>
              <textarea
                ref={inputRef}
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
                className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:outline-none"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => stop()}
                  aria-label="Stop generating"
                  className="btn btn-secondary btn-icon size-9 rounded-xl"
                >
                  <StopIcon className="size-3.5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Send"
                  className="btn btn-primary btn-icon size-9 rounded-xl"
                >
                  <SendIcon className="size-4" />
                </button>
              )}
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-fg-subtle">
              <kbd className="kbd">Enter</kbd> to send · <kbd className="kbd">Shift</kbd> +{" "}
              <kbd className="kbd">Enter</kbd> for a new line
            </p>
          </form>
        </section>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Cards                                                                       */
/* -------------------------------------------------------------------------- */

function CardShell({
  title,
  icon,
  pending,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  pending?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="animate-pop-in rounded-2xl border border-line bg-surface-2/50 p-3.5 shadow-card">
      <div className="flex items-center gap-2 text-xs font-semibold text-fg">
        {pending ? <Spinner className="size-3.5 text-brand-text" /> : icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function OutcomeLine({ outcome }: { outcome: AssistantOutcome }) {
  const done = outcome.status !== "cancelled";
  return (
    <div className={`alert animate-pop-in ${done ? "alert-success" : "alert-info"}`}>
      {done ? <CheckCircleIcon className="mt-px size-4" /> : <XIcon className="mt-px size-4" />}
      <span className="min-w-0 flex-1">
        {outcome.note}
        {outcome.meetLink && (
          <a
            href={outcome.meetLink}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block font-medium break-all text-brand-text hover:underline"
          >
            {outcome.meetLink}
          </a>
        )}
      </span>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <div role="alert" className="alert alert-danger">
      <AlertCircleIcon className="mt-px size-4" />
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
      return <CardShell title="Drafting email…" pending />;
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
    <CardShell title="Review email" icon={<MailIcon className="size-3.5 text-brand-text" />}>
      <div className="mt-3 space-y-2.5">
        <div>
          <label htmlFor={`${ids}-to`} className={labelClass}>
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
          <label htmlFor={`${ids}-subject`} className={labelClass}>
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
          <label htmlFor={`${ids}-body`} className={labelClass}>
            Message
          </label>
          <textarea
            id={`${ids}-body`}
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={`${inputClass} resize-y leading-relaxed`}
          />
        </div>
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={send.isPending}
          onClick={() => onOutcome({ status: "cancelled", note: "Cancelled. Nothing was sent." })}
          className="btn btn-secondary btn-sm"
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
          className="btn btn-primary btn-sm"
        >
          {send.isPending ? <Spinner className="size-3" /> : <SendIcon className="size-3.5" />}
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
      return <CardShell title="Preparing meeting…" pending />;
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
    <CardShell title="Review meeting" icon={<CalendarIcon className="size-3.5 text-brand-text" />}>
      <div className="mt-3 space-y-2.5">
        <div>
          <label htmlFor={`${ids}-summary`} className={labelClass}>
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
          <label htmlFor={`${ids}-email`} className={labelClass}>
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
            <label htmlFor={`${ids}-date`} className={labelClass}>
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
            <label htmlFor={`${ids}-time`} className={labelClass}>
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
            <label htmlFor={`${ids}-duration`} className={labelClass}>
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
          <label htmlFor={`${ids}-desc`} className={labelClass}>
            Agenda (optional)
          </label>
          <textarea
            id={`${ids}-desc`}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClass} resize-y`}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-fg-muted">
          <input
            type="checkbox"
            checked={openAccess}
            onChange={(e) => setOpenAccess(e.target.checked)}
            className="size-3.5 accent-(--ui-brand)"
          />
          Anyone with the link can join without knocking
        </label>
      </div>

      <p className="mt-3 rounded-lg bg-surface px-2.5 py-1.5 text-[11px] text-fg-muted ring-1 ring-line">
        {startValid
          ? `${start.toLocaleString([], { dateStyle: "full", timeStyle: "short" })} – ${end.toLocaleTimeString([], { timeStyle: "short" })}`
          : "Pick a valid date and start time."}
      </p>
      {!durationValid && (
        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
          Length must be between 5 and 480 minutes.
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={schedule.isPending}
          onClick={() => onOutcome({ status: "cancelled", note: "Cancelled. Nothing was scheduled." })}
          className="btn btn-secondary btn-sm"
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
          className="btn btn-primary btn-sm"
        >
          {schedule.isPending ? <Spinner className="size-3" /> : <VideoIcon className="size-3.5" />}
          {schedule.isPending ? "Scheduling…" : "Schedule & send invite"}
        </button>
      </div>
    </CardShell>
  );
}
