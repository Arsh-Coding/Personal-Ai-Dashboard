"use client";

import { useRef, useState } from "react";
import { api } from "@/trpc/react";
import { ComposeMailModal } from "./ComposeMailModal";
import { MessageModal } from "./MessageModal";
import { Pagination } from "./Pagination";
import { useNow, usePagination } from "./hooks";
import { useToast } from "./Toaster";
import { Avatar, EmptyState, SegmentedControl, Skeleton, Spinner } from "./primitives";
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  ComposeIcon,
  InboxIcon,
  MailIcon,
  RefreshIcon,
  SearchIcon,
  XIcon,
} from "./icons";
import { mailDateLabel, parseSender } from "@/lib/format";
import type { MailListMessage } from "@/server/api/routers/mail";

const PAGE_SIZE = 8;

type Filter = "all" | "unread";

const isUnread = (m: MailListMessage) => m.labelIds?.includes("UNREAD") ?? false;

/** Shows whichever account the session is on — the server decides, not this. */
export function MailPanel() {
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);
  /**
   * The message being read full-size. Holds the row rather than just an id so the
   * modal header can show sender and subject without another lookup.
   */
  const [viewing, setViewing] = useState<MailListMessage | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const listRef = useRef<HTMLDivElement>(null);
  const now = useNow();
  const toast = useToast();

  const { data: threads, refetch: refetchThreads, isLoading } =
    api.mail.getThreads.useQuery();
  const { data: messages, refetch: refetchMessages } =
    api.mail.getMessages.useQuery();

  const refreshMail = api.mail.refreshMail.useMutation({
    onSuccess: (res) => {
      if (!res.success) {
        toast({ tone: "error", title: "Mail sync failed", description: res.error ?? "Failed to sync Gmail" });
      } else {
        const loaded = res.hydrated ?? 0;
        const left = res.remaining ?? 0;
        toast({
          tone: "success",
          title: "Inbox synced",
          description:
            (loaded ? `${loaded} message${loaded === 1 ? "" : "s"} loaded.` : "You're up to date.") +
            (left ? ` ${left} older still to fetch.` : ""),
        });
      }
      refetchThreads();
      // Hydration fills in sender/subject, so the message list needs refetching too.
      refetchMessages();
    },
    onError: (e) => toast({ tone: "error", title: "Mail sync failed", description: e.message }),
  });
  const remaining = refreshMail.data?.success ? (refreshMail.data.remaining ?? 0) : 0;

  /**
   * Messages grouped by thread once, rather than filtering the whole message
   * list again for every thread row. Server order is oldest first, so each
   * thread's last entry is its latest.
   */
  const byThread = new Map<string, MailListMessage[]>();
  for (const msg of messages ?? []) {
    if (!msg.threadId) continue;
    const list = byThread.get(msg.threadId);
    if (list) list.push(msg);
    else byThread.set(msg.threadId, [msg]);
  }

  /**
   * Newest thread first. Corsair hands threads back in insertion order, which
   * puts mail that arrived after the first sync at the bottom of the list, so
   * order by each thread's latest message instead. Threads whose messages are
   * still unhydrated have no date to sort on and sink to the end — hydration
   * works newest first, so those are the old ones.
   */
  const latestDate = (threadId: string) => {
    let latest = 0;
    for (const msg of byThread.get(threadId) ?? []) {
      const at = Number(msg.internalDate ?? 0);
      if (Number.isFinite(at)) latest = Math.max(latest, at);
    }
    return latest;
  };
  const sortedThreads = [...(threads ?? [])].sort((a, b) => latestDate(b.id) - latestDate(a.id));

  const unreadCount = sortedThreads.filter((t) => (byThread.get(t.id) ?? []).some(isUnread)).length;

  const needle = query.trim().toLowerCase();
  const visibleThreads = sortedThreads.filter((thread) => {
    const msgs = byThread.get(thread.id) ?? [];
    if (filter === "unread" && !msgs.some(isUnread)) return false;
    if (!needle) return true;
    const haystack = [thread.snippet, ...msgs.flatMap((m) => [m.from, m.subject, m.snippet])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });

  const pager = usePagination(visibleThreads, PAGE_SIZE, `${filter}|${needle}`);

  const goTo = (page: number) => {
    pager.goTo(page);
    setExpandedThreadId(null);
    const top = listRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 80) listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const syncing = refreshMail.isPending;

  return (
    <section aria-labelledby="mail-heading" className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-300">
            <MailIcon />
          </div>
          <div>
            <h2 id="mail-heading" className="text-base font-semibold tracking-tight text-fg">
              Inbox
            </h2>
            <p className="text-[11px] text-fg-subtle">
              {threads?.length ?? 0} threads
              {unreadCount > 0 && <> · <span className="font-medium text-brand-text">{unreadCount} unread</span></>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refreshMail.mutate()}
            disabled={syncing}
            aria-label="Sync mail"
            title="Sync mail"
            className="btn btn-secondary btn-sm btn-icon"
          >
            <RefreshIcon className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
          </button>
          <button type="button" onClick={() => setIsComposeOpen(true)} className="btn btn-primary btn-sm">
            <ComposeIcon className="size-3.5" />
            Compose
          </button>
        </div>
      </div>

      {remaining > 0 && (
        <button
          type="button"
          onClick={() => refreshMail.mutate()}
          disabled={syncing}
          className="mt-3 flex w-full animate-fade-in items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-left text-xs text-amber-800 transition hover:bg-amber-500/15 disabled:opacity-60 dark:text-amber-200"
        >
          <span>
            <span className="font-semibold tabular-nums">{remaining}</span> older messages still to fetch
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            {syncing ? <Spinner className="size-3" /> : <RefreshIcon className="size-3.5" />}
            {syncing ? "Syncing…" : "Sync more"}
          </span>
        </button>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sender, subject, text…"
            aria-label="Search mail"
            className="input py-1.5 pr-8 pl-8 text-xs [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-3 hover:text-fg"
            >
              <XIcon className="size-3" />
            </button>
          )}
        </div>
        <SegmentedControl
          label="Mail filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "unread", label: "Unread", count: unreadCount },
          ]}
        />
      </div>

      <div ref={listRef} className="mt-3 scroll-mt-24">
        {isLoading ? (
          <div className="space-y-1" aria-busy="true" aria-label="Loading mail">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex gap-3 p-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : !threads || threads.length === 0 ? (
          <EmptyState
            icon={<InboxIcon className="size-5" />}
            title="Your inbox is empty here"
            body="Connect Gmail, then sync to bring your recent mail into the dashboard."
            action={
              <button type="button" onClick={() => refreshMail.mutate()} disabled={syncing} className="btn btn-primary btn-sm">
                {syncing ? <Spinner className="size-3" /> : <RefreshIcon className="size-3.5" />}
                Sync mail
              </button>
            }
          />
        ) : visibleThreads.length === 0 ? (
          <EmptyState
            icon={<SearchIcon className="size-5" />}
            title={needle ? "No matches" : "No unread mail"}
            body={needle ? <>Nothing matches &ldquo;{query.trim()}&rdquo;.</> : "You've read everything. Nice."}
            action={
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                className="btn btn-secondary btn-sm"
              >
                Show all mail
              </button>
            }
          />
        ) : (
          <ul
            // Not keyed on the search text: replaying the slide on every
            // keystroke reads as jitter. Rows that newly match still fade in.
            key={`${filter}|${pager.page}`}
            className={`-mx-1.5 space-y-0.5 ${pager.direction > 0 ? "animate-page-next" : "animate-page-prev"}`}
          >
            {pager.pageItems.map((thread, threadIdx) => {
              const threadMessages = byThread.get(thread.id) ?? [];
              // Read thread and message fields separately rather than falling back
              // from one to the other: only a message carries headers, and merging
              // the two shapes is what forced the casts this file used to need.
              const latestMsg = threadMessages[threadMessages.length - 1];
              const snippet = latestMsg?.snippet || thread.snippet || "No snippet available";
              const isExpanded = expandedThreadId === thread.id;
              const unread = threadMessages.some(isUnread);
              const sender = parseSender(latestMsg?.from);
              const at = Number(latestMsg?.internalDate ?? 0);
              const panelId = `thread-${thread.id}`;

              return (
                <li
                  key={thread.id || threadIdx}
                  className="animate-fade-up"
                  style={{ animationDelay: `${Math.min(threadIdx, 8) * 35}ms` }}
                >
                  <div
                    className={`rounded-xl transition-colors ${
                      isExpanded ? "bg-surface-2 ring-1 ring-line" : "hover:bg-surface-2"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedThreadId(isExpanded ? null : thread.id)}
                      aria-expanded={isExpanded}
                      aria-controls={panelId}
                      className="flex w-full items-start gap-3 rounded-xl p-2.5 text-left"
                    >
                      <span className="relative">
                        <Avatar
                          name={latestMsg?.from ? sender.name : "Gmail"}
                          seed={sender.email}
                          className="size-9 text-[11px]"
                        />
                        {unread && (
                          <span className="absolute -top-0.5 -left-0.5 size-2.5 rounded-full bg-brand ring-2 ring-surface" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span
                            className={`truncate text-[13px] ${unread ? "font-semibold text-fg" : "font-medium text-fg-muted"}`}
                          >
                            {latestMsg?.from ? sender.name : "Gmail Thread"}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {threadMessages.length > 1 && (
                              <span className="rounded-full bg-surface-3 px-1.5 text-[10px] font-medium text-fg-subtle tabular-nums">
                                {threadMessages.length}
                              </span>
                            )}
                            <span
                              className={`text-[11px] tabular-nums ${unread ? "font-semibold text-brand-text" : "text-fg-subtle"}`}
                              title={at > 0 ? new Date(at).toLocaleString() : undefined}
                            >
                              {at > 0 && now > 0 ? mailDateLabel(at, now) : ""}
                            </span>
                          </span>
                        </span>
                        <span
                          className={`mt-0.5 block truncate text-xs ${unread ? "font-medium text-fg" : "text-fg-muted"}`}
                        >
                          {latestMsg?.subject || "No Subject"}
                        </span>
                        <span className="mt-0.5 line-clamp-1 text-xs text-fg-subtle">{snippet}</span>
                      </span>
                      <ChevronDownIcon
                        className={`mt-1 size-3.5 text-fg-subtle transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </button>

                    <div
                      id={panelId}
                      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden" inert={!isExpanded}>
                        {threadMessages.length > 0 ? (
                          <ol className="space-y-1.5 px-2.5 pb-2.5">
                            {threadMessages.map((msg, idx) => {
                              const from = parseSender(msg.from);
                              const sentAt = Number(msg.internalDate ?? 0);
                              return (
                                <li
                                  key={msg.id || idx}
                                  className="rounded-lg border border-line bg-surface p-2.5"
                                >
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="truncate font-medium text-fg">
                                      {msg.from ? from.name : "Not loaded yet"}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-fg-subtle tabular-nums">
                                      {sentAt > 0 && now > 0 ? mailDateLabel(sentAt, now) : ""}
                                    </span>
                                  </div>
                                  {msg.snippet && (
                                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-fg-muted">
                                      {msg.snippet}
                                    </p>
                                  )}
                                  {msg.id && (
                                    <button
                                      type="button"
                                      onClick={() => setViewing(msg)}
                                      className="btn btn-secondary btn-sm mt-2 h-7 text-[11px]"
                                    >
                                      Show full mail
                                      <ArrowUpRightIcon className="size-3" />
                                    </button>
                                  )}
                                </li>
                              );
                            })}
                          </ol>
                        ) : (
                          <p className="px-3 pb-3 text-[11px] text-fg-subtle">
                            This thread&apos;s messages haven&apos;t been synced yet.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!isLoading && visibleThreads.length > 0 && (
        <Pagination
          page={pager.page}
          pageCount={pager.pageCount}
          start={pager.start}
          end={pager.end}
          total={pager.total}
          onChange={goTo}
          noun="threads"
        />
      )}

      <ComposeMailModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onSuccess={() => refetchThreads()}
      />

      <MessageModal
        isOpen={viewing !== null}
        onClose={() => setViewing(null)}
        message={viewing}
      />
    </section>
  );
}
