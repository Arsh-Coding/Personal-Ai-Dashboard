"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { meetLinkOf } from "@/lib/meet";
import { eventEndMs, eventStartMs, hashString, isAllDay, relativeTime, timeLabel } from "@/lib/format";
import type { CalendarEvent } from "@/server/api/routers/calendar";
import { useToast } from "./Toaster";
import { Spinner } from "./primitives";
import { CheckIcon, ChevronDownIcon, NoteIcon, VideoIcon } from "./icons";

interface EventCardProps {
  event: CalendarEvent;
  /** The shared clock, for "Now" and "in 12 min". `0` before hydration. */
  now: number;
}

const ACCENTS = [
  "from-violet-500 to-indigo-500",
  "from-sky-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-400",
  "from-pink-500 to-rose-400",
  "from-fuchsia-500 to-purple-500",
];

/** Within this window an upcoming event earns a countdown badge. */
const SOON_MS = 60 * 60_000;

export function EventCard({ event, now }: EventCardProps) {
  const [showNotes, setShowNotes] = useState(false);
  const toast = useToast();

  const eventId = event.id || event.summary || "unknown";

  const { data: note, refetch, isLoading: isNoteLoading } = api.notes.getNote.useQuery(
    { eventId },
    { enabled: showNotes },
  );

  const [content, setContent] = useState<string | null>(null);

  const upsertNote = api.notes.upsertNote.useMutation({
    onSuccess: () => {
      toast({ tone: "success", title: "Note saved" });
      refetch();
    },
    onError: (e) => toast({ tone: "error", title: "Couldn't save note", description: e.message }),
  });

  const handleSaveNotes = () => {
    if (content !== null) {
      upsertNote.mutate({ eventId, content });
    }
  };

  const start = eventStartMs(event);
  const end = eventEndMs(event);
  const allDay = isAllDay(event);
  const live = now > 0 && start <= now && now < end;
  const soon = now > 0 && !live && start > now && start - now <= SOON_MS;
  const past = now > 0 && end <= now;

  const startTimeStr = allDay ? "All day" : Number.isNaN(start) ? "—" : timeLabel(start);
  const endTimeStr = !allDay && event.end?.dateTime ? timeLabel(end) : "";

  const meetLink = meetLinkOf(event);
  const accent = ACCENTS[hashString(event.summary || eventId) % ACCENTS.length];

  // The link already has its own button below, so drop the line `scheduleMeeting`
  // appends to the description — otherwise every Meet event previews as a URL.
  const agenda =
    typeof event.description === "string"
      // `[\s\S]` rather than the `s` flag, which the ES2017 target rules out.
      ? event.description.replace(/\n*Join with Google Meet:[\s\S]*$/, "").trim()
      : "";

  const dirty = content !== null && content !== (note?.content ?? "");

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop ${
        live
          ? "border-brand/40 shadow-[0_0_0_1px_var(--ui-brand),0_12px_30px_-12px_var(--ui-brand)]"
          : "border-line shadow-card hover:border-line-strong"
      } ${past ? "opacity-75 hover:opacity-100" : ""}`}
    >
      {live && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-linear-to-r from-brand/[0.07] via-transparent to-transparent"
        />
      )}

      <div className="relative flex gap-3.5 sm:gap-4">
        <div className="w-16 shrink-0 pt-0.5 text-right sm:w-[4.5rem]">
          <div className="text-sm font-semibold text-fg tabular-nums">{startTimeStr}</div>
          {endTimeStr && <div className="mt-0.5 text-[11px] text-fg-subtle tabular-nums">{endTimeStr}</div>}
        </div>

        <div aria-hidden="true" className={`w-1 shrink-0 rounded-full bg-linear-to-b ${accent}`} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="min-w-0 text-[15px] leading-snug font-semibold text-fg">
              {event.summary || "Untitled Event"}
            </h4>
            {live && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-brand-text uppercase">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-brand" />
                </span>
                Now
              </span>
            )}
            {soon && (
              <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                {relativeTime(start, now)}
              </span>
            )}
          </div>

          {agenda && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">{agenda}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {meetLink && (
              <a
                href={meetLink}
                target="_blank"
                rel="noreferrer"
                className={`btn btn-sm ${live || soon ? "btn-primary" : "btn-secondary"}`}
              >
                <VideoIcon className="size-3.5" />
                Join Meet
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                setShowNotes(!showNotes);
                if (content === null && note) setContent(note.content ?? "");
              }}
              aria-expanded={showNotes}
              className="btn btn-ghost btn-sm"
            >
              <NoteIcon className="size-3.5" />
              {showNotes ? "Hide notes" : "Notes"}
              <ChevronDownIcon
                className={`size-3 transition-transform duration-200 ${showNotes ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              showNotes ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden" inert={!showNotes}>
              <div className="pt-3">
                <div className="relative">
                  <textarea
                    value={content ?? note?.content ?? ""}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSaveNotes();
                      }
                    }}
                    placeholder={
                      isNoteLoading && showNotes
                        ? "Loading notes…"
                        : "Add personal notes or action items for this meeting..."
                    }
                    aria-label={`Notes for ${event.summary || "this event"}`}
                    className="input min-h-20 resize-y text-xs leading-relaxed"
                    rows={3}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-fg-subtle">
                    {dirty ? "Unsaved changes" : note?.content ? "Saved" : "Only you can see these"}
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    disabled={upsertNote.isPending || !dirty}
                    className="btn btn-primary btn-sm"
                  >
                    {upsertNote.isPending ? <Spinner className="size-3" /> : <CheckIcon className="size-3.5" />}
                    {upsertNote.isPending ? "Saving..." : "Save note"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
