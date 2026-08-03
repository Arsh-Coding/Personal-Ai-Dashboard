"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { ModalPortal } from "./ModalPortal";
import type { TenantId } from "@/lib/tenants";

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Account the event is created in. */
  tenant: TenantId;
}

/** What the Meet flow produced, kept on screen so the link can be copied. */
type MeetResult = {
  meetLink: string;
  attendeeEmail: string;
  emailSent: boolean;
  emailError?: string;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 focus:border-purple-500 focus:outline-none";

export function CreateEventModal({ isOpen, onClose, onSuccess, tenant }: CreateEventModalProps) {
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
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

  const resetFields = () => {
    setSummary("");
    setDescription("");
    setAttendeeEmail("");
  };

  const close = () => {
    setError(null);
    setResult(null);
    onClose();
  };

  const createEvent = api.calendar.createEvent.useMutation({
    onSuccess: (res) => {
      if (!res.success) {
        setError(res.error ?? "Failed to create event");
        return;
      }
      resetFields();
      onSuccess();
      close();
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

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!summary || !date || !startTime || !endTime) return;
    setError(null);

    const startDateTime = new Date(`${date}T${startTime}:00`).toISOString();
    const endDateTime = new Date(`${date}T${endTime}:00`).toISOString();

    if (new Date(endDateTime) <= new Date(startDateTime)) {
      setError("The end time has to be after the start time.");
      return;
    }

    if (withMeet) {
      scheduleMeeting.mutate({
        tenant,
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

    createEvent.mutate({ tenant, summary, description, startDateTime, endDateTime });
  };

  if (result) {
    return (
      <ModalPortal isOpen={isOpen} onClose={close} cardClassName="max-w-md">
        <h3 className="text-lg font-semibold text-slate-100">Meeting scheduled</h3>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-xs font-medium text-slate-400">Google Meet link</div>
          <a
            href={result.meetLink}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block break-all text-sm font-medium text-indigo-400 hover:text-indigo-300"
          >
            {result.meetLink}
          </a>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(result.meetLink)}
            className="mt-2 rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            Copy link
          </button>
        </div>

        {result.emailSent ? (
          <p className="mt-3 text-xs text-emerald-400">
            ✓ Invite emailed to {result.attendeeEmail}, and the calendar invitation was sent.
          </p>
        ) : (
          <div className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/40 p-3 text-xs text-amber-300">
            The meeting is on the calendar and {result.attendeeEmail} was invited through
            Google Calendar, but the follow-up email failed
            {result.emailError ? `: ${result.emailError}` : "."} Share the link above by hand.
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={close}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500"
          >
            Done
          </button>
        </div>
      </ModalPortal>
    );
  }

  return (
    <ModalPortal isOpen={isOpen} onClose={close} cardClassName="max-w-md">
      <h3 className="text-lg font-semibold text-slate-100">Schedule New Meeting</h3>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300">Title</label>
          <input
            type="text"
            required
            placeholder="Design Sync"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300">Description (Optional)</label>
          <textarea
            placeholder="Agenda or context..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
            rows={2}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300">Date</label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300">Start Time</label>
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300">End Time</label>
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={withMeet}
              onChange={(e) => setWithMeet(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-purple-600"
            />
            <span>
              <span className="block text-xs font-medium text-slate-200">
                Add a Google Meet link and email the invitee
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-500">
                Creates the Meet space, invites them through Calendar, then sends the link by
                Gmail.
              </span>
            </span>
          </label>

          {withMeet && (
            <div className="mt-3 space-y-3 border-t border-slate-800/80 pt-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">Invitee email</label>
                <input
                  type="email"
                  required
                  placeholder="someone@example.com"
                  value={attendeeEmail}
                  onChange={(e) => setAttendeeEmail(e.target.value)}
                  className={inputClass}
                />
              </div>

              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={openAccess}
                  onChange={(e) => setOpenAccess(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-purple-600"
                />
                <span>
                  <span className="block text-xs font-medium text-slate-200">
                    Anyone with the link can join
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    Otherwise guests knock and you admit them — which needs a Google account.
                  </span>
                </span>
              </label>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-slate-800 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {isPending
              ? withMeet
                ? "Scheduling..."
                : "Creating..."
              : withMeet
                ? "Schedule & Send Invite"
                : "Create Event"}
          </button>
        </div>
      </form>
    </ModalPortal>
  );
}
