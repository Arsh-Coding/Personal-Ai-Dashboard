"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";
import { EventCard } from "./EventCard";
import { CreateEventModal } from "./CreateEventModal";
import { ConnectAccountModal } from "./ConnectAccountModal";
import { MailPanel } from "./MailPanel";
import { AccountSwitcher } from "./AccountSwitcher";
import { useTenant } from "./useTenant";
import { type TenantId } from "@/lib/tenants";

export function Dashboard() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { tenant, selectTenant } = useTenant();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Set only when /oauth/callback couldn't complete the exchange. On success it
  // redirects to a bare `/`, because a fresh connection status is all the
  // dashboard needs to react.
  const authError =
    searchParams.get("corsair_auth") === "error"
      ? (searchParams.get("message") ?? "Authorization failed")
      : null;

  // Per account, so dismissing the prompt for one doesn't suppress it for the
  // other. Cleared on reload — the AccountSwitcher keeps a way back in.
  const [dismissed, setDismissed] = useState<Partial<Record<TenantId, boolean>>>(
    {},
  );

  const { data: statuses } = api.auth.listStatuses.useQuery();
  const status = statuses?.[tenant];

  /**
   * Derived rather than stored, so the prompt tracks reality on its own:
   * switching to an unauthorized account opens it, and it closes the moment the
   * last plugin reports `connected` instead of needing to be told to. Stays
   * shut while `status` is undefined so it can't flash during the first load.
   */
  const isConnectOpen = status?.connected === false && !dismissed[tenant];

  const closeConnect = () => {
    setDismissed((d) => ({ ...d, [tenant]: true }));
    // Drop `?corsair_auth=error` so a reload doesn't replay a handled failure.
    if (authError) router.replace("/");
  };

  // `tenant` is part of every query key, so switching accounts swaps the cached
  // data instead of showing the previous account's events while refetching.
  const { data: events, refetch: refetchEvents, isLoading: isEventsLoading } =
    api.calendar.getEvents.useQuery({ tenant });
  const { data: stats, refetch: refetchStats } =
    api.calendar.getTodayStats.useQuery({ tenant });

  const refreshEvents = api.calendar.refreshEvents.useMutation({
    onSuccess: (res) => {
      if (!res.success) alert(res.error ?? "Failed to sync calendar");
      refetchEvents();
      refetchStats();
    },
  });

  const handleRefreshAll = () => {
    refreshEvents.mutate({ tenant });
  };

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
          <AccountSwitcher
            value={tenant}
            onChange={selectTenant}
            disabled={refreshEvents.isPending}
            statuses={statuses}
            // Undoing the dismissal is enough — `isConnectOpen` follows from it.
            onConnect={() => setDismissed((d) => ({ ...d, [tenant]: false }))}
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
          <MailPanel tenant={tenant} />
        </section>
      </div>

      <CreateEventModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        tenant={tenant}
        onSuccess={() => {
          refetchEvents();
          refetchStats();
        }}
      />

      <ConnectAccountModal
        isOpen={isConnectOpen}
        onClose={closeConnect}
        tenant={tenant}
        status={status}
        error={authError}
      />
    </div>
  );
}
