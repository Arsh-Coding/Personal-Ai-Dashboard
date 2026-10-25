"use client";

import { useRef, useState } from "react";
import type { CalendarEvent } from "@/server/api/routers/calendar";
import { dayKey, dayLabel, eventEndMs, eventStartMs } from "@/lib/format";
import { EventCard } from "./EventCard";
import { Pagination } from "./Pagination";
import { usePagination } from "./hooks";
import { EmptyState, SegmentedControl, Skeleton, Spinner } from "./primitives";
import { CalendarIcon, PlusIcon, RefreshIcon } from "./icons";

const PAGE_SIZE = 6;

type View = "upcoming" | "past";

interface AgendaPanelProps {
  events: CalendarEvent[] | undefined;
  isLoading: boolean;
  now: number;
  syncing: boolean;
  onSync: () => void;
  onNewMeeting: () => void;
}

/**
 * The calendar, split into what's ahead and what's behind.
 *
 * Upcoming runs soonest first, like any agenda, and includes events still in
 * progress. Past runs most recent first. The server returns one list sorted
 * latest-scheduled first; splitting it here is what lets a freshly booked
 * meeting show up where you'd look for it without burying today under next
 * month.
 */
export function AgendaPanel({ events, isLoading, now, syncing, onSync, onNewMeeting }: AgendaPanelProps) {
  const [view, setView] = useState<View>("upcoming");
  const listRef = useRef<HTMLDivElement>(null);

  const timed = (events ?? []).filter((e) => !Number.isNaN(eventStartMs(e)));
  // Before the clock is known (hydration), everything counts as upcoming.
  const upcoming = timed
    .filter((e) => now === 0 || eventEndMs(e) > now)
    .sort((a, b) => eventStartMs(a) - eventStartMs(b));
  const past = timed
    .filter((e) => now > 0 && eventEndMs(e) <= now)
    .sort((a, b) => eventStartMs(b) - eventStartMs(a));

  const list = view === "upcoming" ? upcoming : past;
  const pager = usePagination(list, PAGE_SIZE, view);

  const goTo = (page: number) => {
    pager.goTo(page);
    // Bring the top of the list back into view if paging left it scrolled past.
    const top = listRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 80) listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Group the visible page by local day, keeping list order.
  const groups: { key: string; label: string; items: CalendarEvent[] }[] = [];
  for (const event of pager.pageItems) {
    const start = eventStartMs(event);
    const key = dayKey(start);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(event);
    else groups.push({ key, label: now ? dayLabel(start, now) : "", items: [event] });
  }

  return (
    <section aria-labelledby="agenda-heading" className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/20 dark:text-violet-300">
            <CalendarIcon />
          </div>
          <div>
            <h2 id="agenda-heading" className="text-base font-semibold tracking-tight text-fg">
              Agenda
            </h2>
            <p className="text-[11px] text-fg-subtle">
              {events?.length ?? 0} events synced from Google Calendar
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SegmentedControl
            label="Agenda view"
            value={view}
            onChange={setView}
            options={[
              { value: "upcoming", label: "Upcoming", count: upcoming.length },
              { value: "past", label: "Past", count: past.length },
            ]}
          />
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            aria-label="Sync calendar"
            title="Sync calendar"
            className="btn btn-secondary btn-sm btn-icon"
          >
            <RefreshIcon className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div ref={listRef} className="mt-5 scroll-mt-24">
        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading events">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex gap-4 rounded-2xl border border-line p-4">
                <div className="w-16 space-y-1.5">
                  <Skeleton className="ml-auto h-4 w-12" />
                  <Skeleton className="ml-auto h-3 w-9" />
                </div>
                <Skeleton className="w-1 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="mt-3 h-7 w-24 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : timed.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon className="size-5" />}
            title="No events yet"
            body="Connect Google Calendar, then sync to pull in your schedule. Or create your first meeting right here."
            action={
              <div className="flex gap-2">
                <button type="button" onClick={onSync} disabled={syncing} className="btn btn-secondary btn-sm">
                  {syncing ? <Spinner className="size-3" /> : <RefreshIcon className="size-3.5" />}
                  Sync calendar
                </button>
                <button type="button" onClick={onNewMeeting} className="btn btn-primary btn-sm">
                  <PlusIcon className="size-3.5" />
                  New meeting
                </button>
              </div>
            }
          />
        ) : list.length === 0 ? (
          view === "upcoming" ? (
            <EmptyState
              icon={<CalendarIcon className="size-5" />}
              title="You're all clear"
              body="Nothing on the calendar ahead. A good moment to plan the next one."
              action={
                <button type="button" onClick={onNewMeeting} className="btn btn-primary btn-sm">
                  <PlusIcon className="size-3.5" />
                  Schedule a meeting
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={<CalendarIcon className="size-5" />}
              title="No past events"
              body="Meetings you've had will show up here."
            />
          )
        ) : (
          <div
            // Remounted per page and view, so each change replays the slide.
            key={`${view}-${pager.page}`}
            className={pager.direction > 0 ? "animate-page-next" : "animate-page-prev"}
          >
            {groups.map((group) => (
              <div key={group.key} className="mb-5 last:mb-0">
                {group.label && (
                  <div className="mb-2.5 flex items-center gap-3">
                    <h3
                      className={`text-[11px] font-semibold tracking-wider uppercase ${
                        group.label === "Today" ? "text-brand-text" : "text-fg-subtle"
                      }`}
                    >
                      {group.label}
                    </h3>
                    <div className="h-px flex-1 bg-line" />
                    <span className="text-[10px] text-fg-subtle tabular-nums">
                      {group.items.length} {group.items.length === 1 ? "event" : "events"}
                    </span>
                  </div>
                )}
                <div className="space-y-2.5">
                  {group.items.map((event, i) => (
                    <div
                      key={event.id || `${group.key}-${i}`}
                      className="animate-fade-up"
                      style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}
                    >
                      <EventCard event={event} now={now} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isLoading && list.length > 0 && (
        <Pagination
          page={pager.page}
          pageCount={pager.pageCount}
          start={pager.start}
          end={pager.end}
          total={pager.total}
          onChange={goTo}
          noun="events"
        />
      )}
    </section>
  );
}
