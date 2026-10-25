"use client";

import type { ReactNode } from "react";
import type { CalendarEvent } from "@/server/api/routers/calendar";
import { meetLinkOf } from "@/lib/meet";
import { dayLabel, relativeTime, timeLabel } from "@/lib/format";
import { CountUp, Skeleton } from "./primitives";
import { CalendarIcon, ClockIcon, MailIcon, TrendingIcon, VideoIcon } from "./icons";

/** What a full working day is, for the "hours blocked" meter. */
const WORKDAY_HOURS = 8;

export type DayStats = {
  todayCount: number;
  hoursBlocked: number;
  /** In progress right now, if anything is. */
  live: CalendarEvent | null;
  /** The next timed event to start. */
  next: CalendarEvent | null;
  nextStart: number;
  /** Event counts for today and the six days after it. */
  week: { label: string; count: number; isToday: boolean }[];
  unreadThreads: number;
  totalThreads: number;
};

const TONES = {
  violet: {
    icon: "bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-300",
    glow: "bg-violet-500/15",
    bar: "from-violet-500 to-fuchsia-500",
  },
  sky: {
    icon: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-300",
    glow: "bg-sky-500/15",
    bar: "from-sky-500 to-cyan-400",
  },
  amber: {
    icon: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-300",
    glow: "bg-amber-500/15",
    bar: "from-amber-500 to-orange-400",
  },
  emerald: {
    icon: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-300",
    glow: "bg-emerald-500/15",
    bar: "from-emerald-500 to-teal-400",
  },
} as const;

function StatCard({
  tone,
  icon,
  label,
  delay,
  children,
}: {
  tone: keyof typeof TONES;
  icon: ReactNode;
  label: string;
  delay: number;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="card group relative animate-fade-up overflow-hidden p-4 transition-all duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-pop"
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-10 -right-10 size-28 rounded-full blur-2xl transition-transform duration-500 group-hover:scale-150 ${t.glow}`}
      />
      <div className="relative flex items-center justify-between">
        <span className="text-xs font-medium text-fg-muted">{label}</span>
        <span className={`flex size-8 items-center justify-center rounded-lg ring-1 ${t.icon}`}>{icon}</span>
      </div>
      <div className="relative mt-3">{children}</div>
    </div>
  );
}

export function StatsRow({ stats, now, loading }: { stats: DayStats; now: number; loading: boolean }) {
  const blockedPct = Math.min((stats.hoursBlocked / WORKDAY_HOURS) * 100, 100);
  const weekTotal = stats.week.reduce((sum, d) => sum + d.count, 0);
  const weekMax = Math.max(1, ...stats.week.map((d) => d.count));
  const featured = stats.live ?? stats.next;
  const featuredLink = featured ? meetLinkOf(featured) : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard tone="violet" icon={<CalendarIcon />} label="Events today" delay={80}>
        {loading ? (
          <Skeleton className="h-9 w-16" />
        ) : (
          <div className="text-3xl font-bold tracking-tight text-fg">
            <CountUp value={stats.todayCount} />
          </div>
        )}
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-fg-subtle">
            <span>
              <span className="font-medium text-fg-muted tabular-nums">{stats.hoursBlocked}h</span> blocked
            </span>
            <span>of {WORKDAY_HOURS}h</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className={`h-full origin-left animate-grow-x rounded-full bg-linear-to-r transition-[width] duration-1000 ease-out ${TONES.violet.bar}`}
              style={{ width: `${blockedPct}%`, animationDelay: "250ms" }}
            />
          </div>
        </div>
      </StatCard>

      <StatCard tone="sky" icon={<ClockIcon />} label={stats.live ? "Happening now" : "Next up"} delay={140}>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ) : featured ? (
          <>
            <p className="line-clamp-1 text-base font-semibold text-fg" title={featured.summary}>
              {featured.summary || "Untitled Event"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              {stats.live ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/12 px-2 py-0.5 font-semibold text-sky-700 dark:text-sky-300">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-500 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-sky-500" />
                  </span>
                  In progress
                </span>
              ) : (
                now > 0 && (
                  <>
                    <span className="text-fg-muted">
                      {dayLabel(stats.nextStart, now)} · {timeLabel(stats.nextStart)}
                    </span>
                    <span className="rounded-full bg-sky-500/12 px-2 py-0.5 font-semibold text-sky-700 dark:text-sky-300">
                      {relativeTime(stats.nextStart, now)}
                    </span>
                  </>
                )
              )}
            </div>
            {featuredLink && (
              <a href={featuredLink} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm mt-3 h-7">
                <VideoIcon className="size-3.5" /> Join Meet
              </a>
            )}
          </>
        ) : (
          <>
            <p className="text-base font-semibold text-fg">Nothing scheduled</p>
            <p className="mt-1 text-[11px] text-fg-subtle">Your calendar is wide open.</p>
          </>
        )}
      </StatCard>

      <StatCard tone="amber" icon={<MailIcon />} label="Unread threads" delay={200}>
        {loading ? (
          <Skeleton className="h-9 w-16" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-fg">
              <CountUp value={stats.unreadThreads} />
            </span>
            {stats.unreadThreads === 0 && stats.totalThreads > 0 && (
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Inbox zero</span>
            )}
          </div>
        )}
        <p className="mt-3 text-[11px] text-fg-subtle">
          <span className="font-medium text-fg-muted tabular-nums">{stats.totalThreads}</span> threads synced from Gmail
        </p>
      </StatCard>

      <StatCard tone="emerald" icon={<TrendingIcon />} label="Next 7 days" delay={260}>
        <div className="flex items-end justify-between gap-3">
          {loading ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <div className="text-3xl font-bold tracking-tight text-fg">
              <CountUp value={weekTotal} />
            </div>
          )}
          <div className="flex h-10 items-end gap-1" aria-label="Events per day this week" role="img">
            {stats.week.map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-1" title={`${d.label}: ${d.count}`}>
                <div className="flex h-7 w-2.5 items-end overflow-hidden rounded-sm bg-surface-3">
                  <div
                    className={`w-full origin-bottom animate-grow-y rounded-sm bg-linear-to-t transition-[height] duration-700 ease-out ${
                      d.isToday ? TONES.emerald.bar : "from-emerald-500/50 to-teal-400/50"
                    }`}
                    style={{ height: `${(d.count / weekMax) * 100}%`, animationDelay: `${350 + i * 60}ms` }}
                  />
                </div>
                <span className={`text-[9px] leading-none ${d.isToday ? "font-bold text-fg" : "text-fg-subtle"}`}>
                  {d.label.slice(0, 1)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-fg-subtle">Events on your calendar this week</p>
      </StatCard>
    </div>
  );
}
