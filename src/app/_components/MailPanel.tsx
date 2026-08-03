"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { ComposeMailModal } from "./ComposeMailModal";
import type { TenantId } from "@/lib/tenants";

interface MailPanelProps {
  /** Account whose mail is shown, and which outgoing mail is sent from. */
  tenant: TenantId;
}

export function MailPanel({ tenant }: MailPanelProps) {
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);

  const { data: threads, refetch: refetchThreads, isLoading } =
    api.mail.getThreads.useQuery({ tenant });
  const { data: messages, refetch: refetchMessages } =
    api.mail.getMessages.useQuery({ tenant });

  const refreshMail = api.mail.refreshMail.useMutation({
    onSuccess: (res) => {
      if (!res.success) alert(res.error ?? "Failed to sync Gmail");
      refetchThreads();
      // Hydration fills in sender/subject, so the message list needs refetching too.
      refetchMessages();
    },
  });
  const remaining = refreshMail.data?.success ? (refreshMail.data.remaining ?? 0) : 0;

  /**
   * Newest thread first. Corsair hands threads back in insertion order, which
   * puts mail that arrived after the first sync at the bottom of the list, so
   * order by each thread's latest message instead. Threads whose messages are
   * still unhydrated have no date to sort on and sink to the end — hydration
   * works newest first, so those are the old ones.
   */
  const latestDateByThread = new Map<string, number>();
  for (const msg of messages ?? []) {
    const at = Number((msg as any).internalDate ?? 0);
    const threadId = (msg as any).threadId;
    if (!threadId || !Number.isFinite(at)) continue;
    latestDateByThread.set(threadId, Math.max(latestDateByThread.get(threadId) ?? 0, at));
  }
  const sortedThreads = [...(threads ?? [])].sort(
    (a: any, b: any) =>
      (latestDateByThread.get(b.id) ?? 0) - (latestDateByThread.get(a.id) ?? 0),
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-slate-100">Gmail Inbox</h3>
          <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-400">
            {threads?.length ?? 0} Threads
          </span>
          {remaining > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
              {remaining} older to sync
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshMail.mutate({ tenant })}
            disabled={refreshMail.isPending}
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {refreshMail.isPending ? "Syncing..." : "Sync Mail"}
          </button>
          <button
            onClick={() => setIsComposeOpen(true)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          >
            Compose
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-500">Loading threads...</div>
        ) : !threads || threads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
            No cached mail threads. Authenticate Gmail via Corsair and click &quot;Sync Mail&quot;.
          </div>
        ) : (
          sortedThreads.map((thread: any) => {
            const threadMessages = (messages ?? []).filter((m: any) => m.threadId === thread.id);
            const latestMsg = threadMessages[threadMessages.length - 1] || thread;
            const snippet = latestMsg.snippet || thread.snippet || "No snippet available";
            const isExpanded = expandedThreadId === thread.id;

            return (
              <div
                key={thread.id || Math.random()}
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5 transition-all hover:border-slate-700"
              >
                <div
                  className="cursor-pointer"
                  onClick={() => setExpandedThreadId(isExpanded ? null : thread.id)}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">
                      {latestMsg.from || "Gmail Thread"}
                    </span>
                    <span className="text-slate-500">
                      {latestMsg.internalDate
                        ? new Date(Number(latestMsg.internalDate)).toLocaleDateString()
                        : ""}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-medium text-indigo-300">
                    {latestMsg.subject || "No Subject"}
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-400">{snippet}</p>
                </div>

                {isExpanded && threadMessages.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-slate-800/80 pt-3">
                    {threadMessages.map((msg: any, idx: number) => (
                      <div key={msg.id || idx} className="rounded-lg bg-slate-900/90 p-2.5 text-xs text-slate-300">
                        <div className="font-medium text-slate-200">{msg.from}</div>
                        <div className="mt-1 text-slate-400">{msg.snippet}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <ComposeMailModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        tenant={tenant}
        onSuccess={() => refetchThreads()}
      />
    </div>
  );
}
