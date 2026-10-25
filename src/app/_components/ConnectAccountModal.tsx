"use client";

import { api } from "@/trpc/react";
import { ModalHeader, ModalPortal } from "./ModalPortal";
import { useToast } from "./Toaster";
import { Spinner } from "./primitives";
import { pluginMeta, type PluginId, type TenantConnection } from "@/lib/plugins";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  LinkIcon,
  MailIcon,
  VideoIcon,
} from "./icons";

const PLUGIN_ICONS: Record<PluginId, typeof MailIcon> = {
  gmail: MailIcon,
  googlecalendar: CalendarIcon,
  googlemeet: VideoIcon,
};

interface ConnectAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * The signed-in address, for labelling only. Used to come from a hardcoded
   * table keyed by tenant id; that table is gone, and the server decides which
   * account gets authorized regardless of what is shown here.
   */
  email: string;
  /** Undefined while the status query is still in flight. */
  status?: TenantConnection;
  /** Message from a failed callback, surfaced instead of a bare redirect. */
  error?: string | null;
}

export function ConnectAccountModal({
  isOpen,
  onClose,
  email,
  status,
  error,
}: ConnectAccountModalProps) {
  const toast = useToast();
  const total = status?.plugins.length ?? 0;
  const connectedCount = total - (status?.pending.length ?? 0);

  const getConnectUrl = api.auth.getConnectUrl.useMutation({
    onSuccess: (res) => {
      if (!res.success) {
        toast({ tone: "error", title: "Couldn't start authorization", description: res.error });
        return;
      }
      // Full-page navigation rather than a popup: the consent screen refuses to
      // render in a frame, and popups get blocked. Google returns to
      // /oauth/callback, which redirects back here with the result.
      window.location.href = res.url;
    },
    onError: (e) =>
      toast({ tone: "error", title: "Couldn't start authorization", description: e.message }),
  });

  // No tenant sent: the server authorizes whichever account the session is on.
  const connect = (plugin: PluginId) => getConnectUrl.mutate({ plugin });

  const nextPending = status?.pending[0];

  // An expired grant is a different problem from a missing one, and only one of
  // the two is the user's fault. Google will not renew a revoked refresh token,
  // so consent is the only route back — say that rather than implying the
  // account was never set up.
  const isReauth = (status?.plugins ?? []).some(
    (p) => p.state === "needs_reauth",
  );

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} cardClassName="max-w-md">
      <ModalHeader
        icon={<LinkIcon className="size-5" />}
        title={`${isReauth ? "Reconnect" : "Connect"} Google`}
        onClose={onClose}
        subtitle={
          isReauth ? (
            <>
              Google expired this account&apos;s authorization, so calls fail with{" "}
              <code className="rounded bg-surface-2 px-1 text-fg">invalid_grant</code>. A refresh
              token can&apos;t be renewed — authorize again as{" "}
              <span className="font-medium text-fg">{email}</span> to issue a new one.
            </>
          ) : (
            <>
              Corsair has no permission to read your mail or calendar yet, so both come back
              empty. Grant access as <span className="font-medium text-fg">{email}</span> to
              connect them.
            </>
          )
        }
      />

      {error && (
        <div role="alert" className="alert alert-danger mt-4">
          <AlertCircleIcon className="mt-px size-4" />
          Authorization failed: {error}
        </div>
      )}

      {total > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between text-[11px] font-medium">
            <span className="text-fg-muted">Setup progress</span>
            <span className="text-fg-subtle tabular-nums">
              {connectedCount} of {total} connected
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-linear-to-r from-brand to-emerald-500 transition-[width] duration-700 ease-out"
              style={{ width: `${(connectedCount / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {(status?.plugins ?? []).map((plugin, i) => {
          const isConnected = plugin.state === "connected";
          const isExpired = plugin.state === "needs_reauth";
          const Icon = PLUGIN_ICONS[plugin.id];
          return (
            <li
              key={plugin.id}
              style={{ animationDelay: `${i * 60}ms` }}
              className="flex animate-fade-up items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-3"
            >
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ${
                  isConnected
                    ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400"
                    : isExpired
                      ? "bg-amber-500/10 text-amber-600 ring-amber-500/25 dark:text-amber-400"
                      : "bg-surface text-fg-muted ring-line"
                }`}
              >
                <Icon />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-fg">{pluginMeta(plugin.id).label}</div>
                <div
                  className={`text-[11px] ${
                    isExpired ? "text-amber-600 dark:text-amber-400" : isConnected ? "text-emerald-600 dark:text-emerald-400" : "text-fg-subtle"
                  }`}
                >
                  {plugin.state === "missing_credentials"
                    ? "App credentials not configured — run corsair setup"
                    : isExpired
                      ? "Authorization expired — reconnect to continue"
                      : isConnected
                        ? "Connected"
                        : "Not connected"}
                </div>
              </div>

              {isConnected ? (
                <span className="flex size-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-500/40">
                  <CheckIcon className="size-3.5" strokeWidth={3} />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => connect(plugin.id)}
                  disabled={getConnectUrl.isPending || plugin.state === "missing_credentials"}
                  className="btn btn-secondary btn-sm"
                >
                  {getConnectUrl.isPending ? "Opening..." : isExpired ? "Reconnect" : "Connect"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* Each plugin is its own OAuth grant, so a fresh account takes two trips
          through the consent screen. Saying so up front stops the second prompt
          from looking like the first one failed. */}
      {nextPending && total > 1 && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-fg-subtle">
          <AlertTriangleIcon className="mt-px size-3.5" />
          Each Google service is authorized separately, so you&apos;ll see Google&apos;s consent
          screen once per service.
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          {nextPending ? "Later" : "Close"}
        </button>
        {nextPending && (
          <button
            type="button"
            onClick={() => connect(nextPending)}
            disabled={getConnectUrl.isPending}
            className="btn btn-primary"
          >
            {getConnectUrl.isPending ? <Spinner className="size-3.5" /> : null}
            {getConnectUrl.isPending
              ? "Opening Google..."
              : `${isReauth ? "Reconnect" : "Connect"} ${pluginMeta(nextPending).label}`}
            {!getConnectUrl.isPending && <ArrowRightIcon />}
          </button>
        )}
      </div>
    </ModalPortal>
  );
}
