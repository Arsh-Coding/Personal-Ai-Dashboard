"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { ModalHeader, ModalPortal } from "./ModalPortal";
import { useNow } from "./hooks";
import { useToast } from "./Toaster";
import { Spinner } from "./primitives";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  CopyIcon,
  LinkIcon,
  VideoIcon,
} from "./icons";
import { addMinutesToTime, toDateInputValue } from "@/lib/format";

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** What the Meet flow produced, kept on screen so the link can be copied. */
type MeetResult = {
  meetLink: string;
  attendeeEmail: string;
  emailSent: boolean;
  emailError?: string;
};

const DURATIONS = [15, 30, 45, 60, 90];

function minutesBetween(start: string, end: string): number {
  const parse = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };
  return parse(end) - parse(start);
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return minutes % 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes / 60}h`;
}

/** An accessible on/off switch, for options that reveal more of the form. */
function Switch({
  checked,
  onChange,
  labelledBy,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelledBy: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
        checked ? "bg-linear-to-r from-brand to-brand-2" : "bg-surface-3 ring-1 ring-line-strong ring-inset"
      }`}
    >
      <span
        className={`inline-block size-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/** Creates in whichever account the session is on — the server decides, not this. */
export function CreateEventModal({ isOpen, onClose, onSuccess }: CreateEventModalProps) {
  const now = useNow();
  const toast = useToast();

  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  // Empty means "today", resolved at render so it's right even if the page
  // has been open since yesterday.
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");

  // Off by default, so the original "just put it on my calendar" path is
  // untouched and nothing gets emailed to anyone unless it was asked for.
  const [withMeet, setWithMeet] = useState(false);
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [openAccess, setOpenAccess] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MeetResult | null>(null);
  const [copied, setCopied] = useState(false);

  /**
   * The last run's error and result are cleared when the modal next opens, not
   * when it closes. Clearing on close would swap the "Meeting scheduled" card
   * back to the form while the modal is still animating out.
   */
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setError(null);
      setResult(null);
      setCopied(false);
    }
  }

  const effectiveDate = date || (now ? toDateInputValue(now) : "");
  const duration = minutesBetween(startTime, endTime);

  const resetFields = () => {
    setSummary("");
    setDescription("");
    setAttendeeEmail("");
    setDate("");
  };

  const createEvent = api.calendar.createEvent.useMutation({
    onSuccess: (res) => {
      if (!res.success) {
        setError(res.error ?? "Failed to create event");
        return;
      }
      toast({ tone: "success", title: "Event created", description: summary });
      resetFields();
      onSuccess();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  const scheduleMeeting = api.meet.scheduleMeeting.useMutation({
    onSuccess: (res) => {
      if (!res.success) {
        setError(res.error);
        return;
      }
      // Deliberately stays open: the Meet link only exists here, and a failed
      // invite email is something the user needs to see rather than a modal
      // that vanishes as if everything worked.
      resetFields();
      setResult({
        meetLink: res.meetLink,
        attendeeEmail: res.attendeeEmail,
        emailSent: res.emailSent,
        emailError: res.emailError,
      });
      onSuccess();
    },
    onError: (e) => setError(e.message),
  });

  const isPending = createEvent.isPending || scheduleMeeting.isPending;

  /** Moving the start keeps the meeting's length, like every calendar app. */
  const changeStart = (next: string) => {
    if (duration > 0) setEndTime(addMinutesToTime(next, duration));
    setStartTime(next);
  };

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!summary || !effectiveDate || !startTime || !endTime) return;
    setError(null);

    const startDateTime = new Date(`${effectiveDate}T${startTime}:00`).toISOString();
    const endDateTime = new Date(`${effectiveDate}T${endTime}:00`).toISOString();

    if (new Date(endDateTime) <= new Date(startDateTime)) {
      setError("The end time has to be after the start time.");
      return;
    }

    if (withMeet) {
      scheduleMeeting.mutate({
        summary,
        description,
        startDateTime,
        endDateTime,
        attendeeEmail,
        // Both times were built from the browser's clock, so the server needs
        // this zone to render them back for the invitee.
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        openAccess,
      });
      return;
    }

    createEvent.mutate({ summary, description, startDateTime, endDateTime });
  };

  if (result) {
    return (
      <ModalPortal isOpen={isOpen} onClose={onClose} cardClassName="max-w-md">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <div className="absolute inset-0 scale-150 rounded-full bg-emerald-500/20 blur-xl" />
            <div className="relative flex size-14 animate-pop-in items-center justify-center rounded-2xl bg-linear-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30">
              <CheckCircleIcon className="size-7" />
            </div>
          </div>
          <h3 className="mt-4 text-lg font-semibold tracking-tight text-fg">Meeting scheduled</h3>
          <p className="mt-1 text-xs text-fg-muted">Share the link below if you need to.</p>
        </div>

        <div className="mt-5 rounded-xl border border-line bg-surface-2 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-fg-subtle">
            <LinkIcon className="size-3.5" /> Google Meet link
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <a
              href={result.meetLink}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-sm font-medium text-brand-text hover:underline"
            >
              {result.meetLink}
            </a>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(result.meetLink);
                setCopied(true);
              }}
              className="btn btn-secondary btn-sm"
            >
              {copied ? <CheckCircleIcon className="size-3.5 text-emerald-500" /> : <CopyIcon className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {result.emailSent ? (
          <div className="alert alert-success mt-3">
            <CheckCircleIcon className="mt-px size-4" />
            Invite emailed to {result.attendeeEmail}, and the calendar invitation was sent.
          </div>
        ) : (
          <div className="alert alert-warning mt-3">
            <AlertTriangleIcon className="mt-px size-4" />
            <span>
              The meeting is on the calendar and {result.attendeeEmail} was invited through
              Google Calendar, but the follow-up email failed
              {result.emailError ? `: ${result.emailError}` : "."} Share the link above by hand.
            </span>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <a href={result.meetLink} target="_blank" rel="noreferrer" className="btn btn-secondary">
            <VideoIcon /> Open Meet
          </a>
          <button type="button" onClick={onClose} className="btn btn-primary">
            Done
          </button>
        </div>
      </ModalPortal>
    );
  }

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} cardClassName="max-w-md">
      <ModalHeader
        icon={<CalendarIcon className="size-5" />}
        title="Schedule new meeting"
        subtitle="Adds it to your Google Calendar."
        onClose={onClose}
      />
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label htmlFor="event-title" className="label">
            Title
          </label>
          <input
            id="event-title"
            type="text"
            required
            autoFocus
            placeholder="Design Sync"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label htmlFor="event-description" className="label">
            Description <span className="font-normal text-fg-subtle">(optional)</span>
          </label>
          <textarea
            id="event-description"
            placeholder="Agenda or context..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input resize-y"
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="event-date" className="label">
              Date
            </label>
            <input
              id="event-date"
              type="date"
              required
              value={effectiveDate}
              onChange={(e) => setDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="event-start" className="label">
              Start
            </label>
            <input
              id="event-start"
              type="time"
              required
              value={startTime}
              onChange={(e) => changeStart(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="event-end" className="label">
              End
            </label>
            <input
              id="event-end"
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="input"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick duration">
          <span className="mr-1 text-[11px] text-fg-subtle">Length</span>
          {DURATIONS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => setEndTime(addMinutesToTime(startTime, minutes))}
              aria-pressed={duration === minutes}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all active:scale-95 ${
                duration === minutes
                  ? "border-brand/40 bg-brand/10 text-brand-text"
                  : "border-line text-fg-muted hover:border-line-strong hover:text-fg"
              }`}
            >
              {durationLabel(minutes)}
            </button>
          ))}
        </div>

        <div
          className={`rounded-xl border p-3.5 transition-colors ${
            withMeet ? "border-brand/30 bg-brand/5" : "border-line bg-surface-2/60"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-brand-text ring-1 ring-line">
              <VideoIcon />
            </div>
            <div className="min-w-0 flex-1">
              <span id="event-meet-label" className="block text-xs font-medium text-fg">
                Add a Google Meet link and email the invitee
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-subtle">
                Creates the Meet space, invites them through Calendar, then sends the link by
                Gmail.
              </span>
            </div>
            <Switch checked={withMeet} onChange={setWithMeet} labelledBy="event-meet-label" />
          </div>

          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              withMeet ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden" inert={!withMeet}>
              <div className="mt-3.5 space-y-3 border-t border-line pt-3.5">
                <div>
                  <label htmlFor="event-invitee" className="label">
                    Invitee email
                  </label>
                  <input
                    id="event-invitee"
                    type="email"
                    required={withMeet}
                    placeholder="someone@example.com"
                    value={attendeeEmail}
                    onChange={(e) => setAttendeeEmail(e.target.value)}
                    className="input"
                  />
                </div>

                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={openAccess}
                    onChange={(e) => setOpenAccess(e.target.checked)}
                    className="mt-0.5 size-4 accent-(--ui-brand)"
                  />
                  <span>
                    <span className="block text-xs font-medium text-fg">Anyone with the link can join</span>
                    <span className="mt-0.5 block text-[11px] text-fg-subtle">
                      Otherwise guests knock and you admit them — which needs a Google account.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="alert alert-danger">
            <AlertCircleIcon className="mt-px size-4" />
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={isPending} className="btn btn-primary">
            {isPending ? <Spinner className="size-3.5" /> : withMeet ? <VideoIcon /> : <CalendarIcon />}
            {isPending
              ? withMeet
                ? "Scheduling..."
                : "Creating..."
              : withMeet
                ? "Schedule & send invite"
                : "Create event"}
          </button>
        </div>
      </form>
    </ModalPortal>
  );
}
