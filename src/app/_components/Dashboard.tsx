"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";
import { CreateEventModal } from "./CreateEventModal";
import { ConnectAccountModal } from "./ConnectAccountModal";
import { MailPanel } from "./MailPanel";
import { UserMenu } from "./UserMenu";
import { SignInScreen } from "./SignInScreen";
import { AssistantPanel } from "./AssistantPanel";
import { AgendaPanel } from "./AgendaPanel";
import { StatsRow, type DayStats } from "./StatsRow";
import { ThemeToggle } from "./ThemeToggle";
import { useToast } from "./Toaster";
import { useNow } from "./hooks";
import { Skeleton } from "./primitives";
import { AlertTriangleIcon, ArrowRightIcon, LogoMark, PlusIcon, SparklesIcon } from "./icons";
import { firstName } from "@/lib/names";
import { SITE } from "@/lib/site";
import {
  dayKey,
  eventEndMs,
  eventStartMs,
  greeting,
  isAllDay,
  relativeTime,
} from "@/lib/format";
import type { CalendarEvent } from "@/server/api/routers/calendar";
import type { MailListMessage, MailListThread } from "@/server/api/routers/mail";

const DAY_MS = 24 * 60 * 60_000;

/**
 * Today's numbers, worked out in the browser.
 *
 * `calendar.getTodayStats` does this on the server, but the server's "today"
 * is UTC's, which is the wrong day for most of the evening anywhere east of
 * London and most of the morning anywhere west. The events are already here,
 * so counting them locally is both correct and one request fewer.
 */
function computeStats(
  events: CalendarEvent[],
  threads: MailListThread[],
  messages: MailListMessage[],
  now: number,
): DayStats {
  const today = now ? dayKey(now) : "";
  let todayCount = 0;
  let blockedMs = 0;
  let live: CalendarEvent | null = null;
  let next: CalendarEvent | null = null;
  let nextStart = Infinity;

  const week = Array.from({ length: 7 }, (_, i) => {
    const at = now + i * DAY_MS;
    return {
      key: now ? dayKey(at) : String(i),
      label: now ? new Date(at).toLocaleDateString([], { weekday: "short" }) : "",
      count: 0,
      isToday: i === 0,
    };
  });

  for (const event of events) {
    const start = eventStartMs(event);
    if (Number.isNaN(start)) continue;
    const end = eventEndMs(event);
    const key = dayKey(start);

    if (key === today) {
      todayCount++;
      if (!isAllDay(event)) blockedMs += Math.max(end - start, 0);
    }
    const slot = week.find((d) => d.key === key);
    if (slot) slot.count++;

    // All-day events aren't meetings; they'd sit in "Now" all day.
    if (!now || isAllDay(event)) continue;
    if (start <= now && now < end) {
      if (!live || start > eventStartMs(live)) live = event;
    } else if (start > now && start < nextStart) {
      next = event;
      nextStart = start;
    }
  }

  const unreadThreadIds = new Set(
    messages.filter((m) => m.threadId && m.labelIds?.includes("UNREAD")).map((m) => m.threadId),
  );

  return {
    todayCount,
    hoursBlocked: Math.round((blockedMs / 3_600_000) * 10) / 10,
    live,
    next,
    nextStart,
    week,
    unreadThreads: threads.filter((t) => unreadThreadIds.has(t.id)).length,
    totalThreads: threads.length,
  };
}

/** One sentence about the day, so the first thing on screen is useful. */
function daySummary(stats: DayStats, events: CalendarEvent[], now: number): string {
  if (!now) return "";
  const remainingToday = events.filter((e) => {
    const start = eventStartMs(e);
    return !Number.isNaN(start) && dayKey(start) === dayKey(now) && eventEndMs(e) > now;
  }).length;

  if (stats.live) return `"${stats.live.summary || "Untitled event"}" is happening now.`;
  if (stats.todayCount === 0) {
    return stats.next
      ? `Your calendar is clear today. Next up: "${stats.next.summary || "Untitled event"}" ${relativeTime(stats.nextStart, now)}.`
      : "Your calendar is clear today. Enjoy the focus time.";
  }
  const count = `${stats.todayCount} ${stats.todayCount === 1 ? "event" : "events"} today`;
  if (remainingToday === 0) return `You had ${count}, and they're all done. Nice work.`;
  if (stats.next && dayKey(stats.nextStart) === dayKey(now)) {
    return `You have ${count}. Next up is "${stats.next.summary || "Untitled event"}" ${relativeTime(stats.nextStart, now)}.`;
  }
  return `You have ${count}, ${remainingToday} still ahead.`;
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your dashboard">
      <div className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-8 rounded-xl" />
            <Skeleton className="hidden h-4 w-40 sm:block" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-32 rounded-xl" />
            <Skeleton className="size-9 rounded-full" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-9 w-72" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        <Skeleton className="mt-6 h-12 w-full max-w-xl rounded-2xl" />
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Skeleton className="h-[28rem] rounded-2xl lg:col-span-7" />
          <Skeleton className="h-[28rem] rounded-2xl lg:col-span-5" />
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const now = useNow();
  const toast = useToast();

  /** Who is signed in. `null` once loaded means nobody. */
  const session = api.session.me.useQuery();
  const signedIn = !!session.data;

  // `corsair_auth=error` comes back from Corsair's data-access callback;
  // `auth_error` from the sign-in callback. Different flows, same surface.
  const authError =
    searchParams.get("corsair_auth") === "error"
      ? (searchParams.get("message") ?? "Authorization failed")
      : null;
  const signInError = searchParams.get("auth_error");

  // Cleared on reload — the UserMenu keeps a way back in.
  const [dismissed, setDismissed] = useState(false);

  // Only the signed-in user's own status; there is no longer any way to ask
  // about another account.
  const { data: status } = api.auth.myStatus.useQuery(undefined, {
    enabled: signedIn,
  });

  /**
   * Derived rather than stored, so the prompt tracks reality on its own: it
   * closes the moment the last plugin reports `connected` instead of needing to
   * be told to. Stays shut while `status` is undefined so it can't flash during
   * the first load.
   */
  const isConnectOpen = status?.connected === false && !dismissed;
  const needsAuth = status?.connected === false;
  const expired = status?.plugins.some((p) => p.state === "needs_reauth");

  const closeConnect = () => {
    setDismissed(true);
    // Drop `?corsair_auth=error` so a reload doesn't replay a handled failure.
    if (authError) router.replace("/");
  };

  /**
   * No tenant in the query key or the request — the server reads it from the
   * session cookie, so these can only ever return the signed-in user's data.
   *
   * The mail queries share their cache with `MailPanel`, so reading them here
   * for the unread count costs no extra request.
   */
  const { data: events, refetch: refetchEvents, isLoading: isEventsLoading } =
    api.calendar.getEvents.useQuery(undefined, { enabled: signedIn });
  const { data: threads, isLoading: isThreadsLoading } = api.mail.getThreads.useQuery(undefined, {
    enabled: signedIn,
  });
  const { data: messages } = api.mail.getMessages.useQuery(undefined, { enabled: signedIn });

  const refreshEvents = api.calendar.refreshEvents.useMutation({
    onSuccess: (res) => {
      if (!res.success) {
        toast({ tone: "error", title: "Calendar sync failed", description: res.error ?? "Failed to sync calendar" });
      } else {
        toast({ tone: "success", title: "Calendar synced" });
      }
      refetchEvents();
    },
    onError: (e) => toast({ tone: "error", title: "Calendar sync failed", description: e.message }),
  });

  /**
   * Nothing renders until the server says who this is.
   *
   * Every hook above runs unconditionally and is gated on `signedIn`, so these
   * early returns are safe. The data queries would fail with UNAUTHORIZED anyway —
   * this just avoids firing them to find that out.
   */
  if (session.isLoading) {
    return <DashboardSkeleton />;
  }

  if (!session.data) {
    return <SignInScreen error={signInError} />;
  }

  const user = session.data;
  const allEvents = events ?? [];
  const stats = computeStats(allEvents, threads ?? [], messages ?? [], now);
  const summary = daySummary(stats, allEvents, now);
  const dateLine = now
    ? new Date(now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
    : "";

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/75 backdrop-blur-xl supports-[backdrop-filter]:bg-canvas/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark />
            <span className="hidden truncate text-sm font-semibold tracking-tight text-fg sm:block">
              {SITE.name}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="btn btn-primary btn-sm h-9 px-3 sm:px-3.5"
              aria-label="New meeting"
            >
              <PlusIcon />
              <span className="hidden sm:inline">New meeting</span>
            </button>
            <ThemeToggle />
            <UserMenu
              email={user.email}
              name={user.name}
              image={user.image}
              status={status}
              // Undoing the dismissal is enough — `isConnectOpen` follows from it.
              onConnect={() => setDismissed(false)}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pt-8 pb-28 sm:px-6 lg:px-8">
        <section className="animate-fade-up">
          <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
            {dateLine || " "}
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
            {now ? greeting(now) : "Hello"},{" "}
            <span className="text-gradient animate-gradient">{firstName(user.name, user.email)}</span>
          </h1>
          {summary && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">{summary}</p>}

          <button
            type="button"
            onClick={() => setAssistantOpen(true)}
            className="group mt-6 flex w-full max-w-xl items-center gap-3 rounded-2xl border border-line bg-surface p-2 pl-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_12px_32px_-12px_var(--ui-brand)]"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand via-fuchsia-500 to-brand-2 text-white">
              <SparklesIcon className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-fg-subtle group-hover:text-fg-muted">
              Ask the assistant to draft an email or set up a meeting…
            </span>
            <span className="hidden items-center gap-1 pr-1 sm:flex">
              <kbd className="kbd">Ctrl</kbd>
              <kbd className="kbd">K</kbd>
            </span>
          </button>
        </section>

        {needsAuth && !isConnectOpen && (
          <div
            role="status"
            className="mt-6 flex animate-fade-up flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4 sm:flex-row sm:items-center"
          >
            <div className="flex flex-1 items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
                <AlertTriangleIcon />
              </span>
              <div>
                <p className="text-sm font-semibold text-fg">
                  {expired ? "Google authorization expired" : "Finish connecting Google"}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                  {expired
                    ? "Google revoked access for one of your services, so it has stopped syncing. Reconnect to pick up where you left off."
                    : "Some of Gmail, Calendar and Meet aren't connected yet, so parts of your dashboard will stay empty."}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => setDismissed(false)} className="btn btn-primary btn-sm self-start sm:self-center">
              {expired ? "Reconnect" : "Connect"} <ArrowRightIcon className="size-3.5" />
            </button>
          </div>
        )}

        <div className="mt-8">
          <StatsRow stats={stats} now={now} loading={isEventsLoading || isThreadsLoading} />
        </div>

        <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="animate-fade-up lg:col-span-7" style={{ animationDelay: "300ms" }}>
            <AgendaPanel
              events={events}
              isLoading={isEventsLoading}
              now={now}
              syncing={refreshEvents.isPending}
              onSync={() => refreshEvents.mutate()}
              onNewMeeting={() => setIsCreateModalOpen(true)}
            />
          </div>

          <div className="animate-fade-up lg:col-span-5" style={{ animationDelay: "380ms" }}>
            {/* Keyed by account so a sign-in as someone else resets which thread
                is expanded rather than carrying a reading position across. */}
            <MailPanel key={user.tenant} />
          </div>
        </div>
      </div>

      <CreateEventModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          refetchEvents();
        }}
      />

      <ConnectAccountModal
        isOpen={isConnectOpen}
        onClose={closeConnect}
        email={user.email}
        status={status}
        error={authError}
      />

      {/* Keyed by account, like the mail panel, so signing in as someone else
          never shows the previous person's conversation. Rendered outside every
          animated wrapper: it's `position: fixed`, and an ancestor mid-transform
          would become its containing block. */}
      <AssistantPanel key={user.tenant} open={assistantOpen} onOpenChange={setAssistantOpen} />
    </>
  );
}
