"use client";

import { api } from "@/trpc/react";
import { ModalPortal } from "./ModalPortal";
import { pluginMeta, type PluginId, type TenantConnection } from "@/lib/plugins";

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
  const connectedCount =
    (status?.plugins.length ?? 0) - (status?.pending.length ?? 0);

  const getConnectUrl = api.auth.getConnectUrl.useMutation({
    onSuccess: (res) => {
      if (!res.success) {
        alert(res.error);
        return;
      }
      // Full-page navigation rather than a popup: the consent screen refuses to
      // render in a frame, and popups get blocked. Google returns to
      // /oauth/callback, which redirects back here with the result.
      window.location.href = res.url;
    },
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
      <h3 className="text-lg font-semibold text-slate-100">
        {isReauth ? "Reconnect" : "Connect"} Google
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        {isReauth ? (
          <>
            Google expired this account&apos;s authorization, so calls fail with{" "}
            <code className="text-slate-300">invalid_grant</code>. A refresh
            token can&apos;t be renewed — authorize again as{" "}
            <span className="font-medium text-slate-200">{email}</span> to issue
            a new one.
          </>
        ) : (
          <>
            Corsair has no permission to read your mail or calendar yet, so both
            come back empty. Grant access as{" "}
            <span className="font-medium text-slate-200">{email}</span> to
            connect them.
          </>
        )}
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
          Authorization failed: {error}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {(status?.plugins ?? []).map((plugin) => {
          const isConnected = plugin.state === "connected";
          const isExpired = plugin.state === "needs_reauth";
          return (
            <div
              key={plugin.id}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3"
            >
              <div>
                <div className="text-sm font-medium text-slate-200">
                  {pluginMeta(plugin.id).label}
                </div>
                <div
                  className={
                    isExpired
                      ? "text-[11px] text-amber-400"
                      : "text-[11px] text-slate-500"
                  }
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
                <span className="text-xs font-semibold text-emerald-400">✓</span>
              ) : (
                <button
                  type="button"
                  onClick={() => connect(plugin.id)}
                  disabled={
                    getConnectUrl.isPending ||
                    plugin.state === "missing_credentials"
                  }
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {getConnectUrl.isPending
                    ? "Opening..."
                    : isExpired
                      ? "Reconnect"
                      : "Connect"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Each plugin is its own OAuth grant, so a fresh account takes two trips
          through the consent screen. Saying so up front stops the second prompt
          from looking like the first one failed. */}
      {nextPending && (status?.plugins.length ?? 0) > 1 && (
        <p className="mt-3 text-[11px] text-slate-500">
          {connectedCount} of {status?.plugins.length} connected — each Google
          service is authorized separately.
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-800 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
        >
          Close
        </button>
        {nextPending && (
          <button
            type="button"
            onClick={() => connect(nextPending)}
            disabled={getConnectUrl.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {getConnectUrl.isPending
              ? "Opening Google..."
              : `${isReauth ? "Reconnect" : "Connect"} ${pluginMeta(nextPending).label}`}
          </button>
        )}
      </div>
    </ModalPortal>
  );
}
