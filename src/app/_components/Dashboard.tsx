"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";
import { EventCard } from "./EventCard";
import { CreateEventModal } from "./CreateEventModal";
import { ConnectAccountModal } from "./ConnectAccountModal";
import { MailPanel } from "./MailPanel";
import { UserMenu } from "./UserMenu";
import { SignInScreen } from "./SignInScreen";

export function Dashboard() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

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

  const closeConnect = () => {
    setDismissed(true);
    // Drop `?corsair_auth=error` so a reload doesn't replay a handled failure.
    if (authError) router.replace("/");
  };

  /**
   * No tenant in the query key or the request — the server reads it from the
   * session cookie, so these can only ever return the signed-in user's data.
   */
  const { data: events, refetch: refetchEvents, isLoading: isEventsLoading } =
    api.calendar.getEvents.useQuery(undefined, { enabled: signedIn });
  const { data: stats, refetch: refetchStats } =
    api.calendar.getTodayStats.useQuery(undefined, { enabled: signedIn });

  const refreshEvents = api.calendar.refreshEvents.useMutation({
    onSuccess: (res) => {
      if (!res.success) alert(res.error ?? "Failed to sync calendar");
      refetchEvents();
      refetchStats();
    },
  });

  const handleRefreshAll = () => {
    refreshEvents.mutate();
  };

  /**
   * Nothing renders until the server says who this is.
   *
   * Every hook above runs unconditionally and is gated on `signedIn`, so these
   * early returns are safe. The data queries would fail with UNAUTHORIZED anyway —
   * this just avoids firing them to find that out.
   */
  if (session.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center text-xs text-slate-500 sm:px-6 lg:px-8">
        Loading...
      </div>
    );
  }

  if (!session.data) {
    return <SignInScreen error={signInError} />;
  }

  const user = session.data;

  const nextMeetingSummary = stats?.nextMeeting?.summary || "No upcoming meetings";
  const nextMeetingTime = stats?.nextMeeting?.start?.dateTime
    ? new Date(stats.nextMeeting.start.dateTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="bg-linear-to-r from-purple-400 via-indigo-300 to-pink-400 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
              Arsh Workspace
            </h1>
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-300">
              Live Sync
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Google Calendar & Gmail integration powered by Corsair engine
          </p>
        </div>

        <div className="flex items-center gap-3">
          <UserMenu
            email={user.email}
            name={user.name}
            image={user.image}
            status={status}
            // Undoing the dismissal is enough — `isConnectOpen` follows from it.
            onConnect={() => setDismissed(false)}
          />
          <button
            onClick={handleRefreshAll}
            disabled={refreshEvents.isPending}
            className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white disabled:opacity-50"
          >
            <span className={refreshEvents.isPending ? "animate-spin" : ""}>🔄</span>
            {refreshEvents.isPending ? "Syncing..." : "Sync Calendar"}
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-purple-600/20 hover:from-purple-500 hover:to-indigo-500"
          >
            + New Meeting
          </button>
        </div>
      </header>

      {/* Stats Cards Row */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-slate-400">Events Today</div>
          <div className="mt-2 text-3xl font-bold text-slate-100">{stats?.todayCount ?? 0}</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-slate-400">Total Synced Events</div>
          <div className="mt-2 text-3xl font-bold text-purple-400">{stats?.totalCount ?? 0}</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-slate-400">Next Meeting</div>
          <div className="mt-2 line-clamp-1 text-base font-bold text-slate-100">
            {nextMeetingSummary}
          </div>
          {nextMeetingTime && (
            <div className="mt-0.5 text-xs text-indigo-400">at {nextMeetingTime}</div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-slate-400">Hours Blocked Today</div>
          <div className="mt-2 text-3xl font-bold text-pink-400">
            {stats?.hoursBlocked ?? 0} <span className="text-sm font-normal text-slate-400">hrs</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Calendar Agenda & Mail Panel */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Calendar Section */}
        <section className="lg:col-span-7">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-100">Upcoming Agenda</h2>
            <span className="text-xs text-slate-400">
              {events?.length ?? 0} events in local DB
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {isEventsLoading ? (
              <div className="rounded-xl border border-slate-800/80 p-8 text-center text-xs text-slate-500">
                Loading calendar events...
              </div>
            ) : !events || events.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
                No cached events. Connect Google Calendar via Corsair and click &quot;Sync Calendar&quot;.
              </div>
            ) : (
              events.map((event: any, idx: number) => (
                <EventCard key={event.id || idx} event={event} />
              ))
            )}
          </div>
        </section>

        {/* Mail Section */}
        <section className="lg:col-span-5">
          {/* Keyed by account so a sign-in as someone else resets which thread
              is expanded rather than carrying a reading position across. */}
          <MailPanel key={user.tenant} />
        </section>
      </div>

      <CreateEventModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          refetchEvents();
          refetchStats();
        }}
      />

      <ConnectAccountModal
        isOpen={isConnectOpen}
        onClose={closeConnect}
        email={user.email}
        status={status}
        error={authError}
      />
    </div>
  );
}
