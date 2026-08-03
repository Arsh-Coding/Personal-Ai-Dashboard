"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { meetLinkOf } from "@/lib/meet";

interface EventCardProps {
  event: any;
}

export function EventCard({ event }: EventCardProps) {
  const [showNotes, setShowNotes] = useState(false);

  const eventId = event.id || event.summary || "unknown";
  
  const { data: note, refetch } = api.notes.getNote.useQuery(
    { eventId },
    { enabled: showNotes }
  );

  const [content, setContent] = useState<string | null>(null);

  const upsertNote = api.notes.upsertNote.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleSaveNotes = () => {
    if (content !== null) {
      upsertNote.mutate({ eventId, content });
    }
  };

  const startTimeStr = event.start?.dateTime
    ? new Date(event.start.dateTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : event.start?.date || "All Day";

  const endTimeStr = event.end?.dateTime
    ? new Date(event.end.dateTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const meetLink = meetLinkOf(event);

  // The link already has its own button below, so drop the line `scheduleMeeting`
  // appends to the description — otherwise every Meet event previews as a URL.
  const agenda =
    typeof event.description === "string"
      // `[\s\S]` rather than the `s` flag, which the ES2017 target rules out.
      ? event.description.replace(/\n*Join with Google Meet:[\s\S]*$/, "").trim()
      : "";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md transition-all hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-purple-400">
            <span>{startTimeStr} {endTimeStr ? `- ${endTimeStr}` : ""}</span>
          </div>
          <h4 className="mt-1 text-base font-medium text-slate-100">{event.summary || "Untitled Event"}</h4>
          {agenda && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{agenda}</p>}
          {meetLink && (
            <a
              href={meetLink}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-200"
            >
              📹 Join Meet
            </a>
          )}
        </div>
        <button
          onClick={() => {
            setShowNotes(!showNotes);
            if (content === null && note) setContent(note.content ?? "");
          }}
          className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          {showNotes ? "Hide Notes" : "Meeting Notes"}
        </button>
      </div>

      {showNotes && (
        <div className="mt-3 border-t border-slate-800/80 pt-3">
          <textarea
            value={content ?? note?.content ?? ""}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add personal notes or action items for this meeting..."
            className="w-full rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            rows={3}
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={handleSaveNotes}
              disabled={upsertNote.isPending}
              className="rounded-md bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-50"
            >
              {upsertNote.isPending ? "Saving..." : "Save Note"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
