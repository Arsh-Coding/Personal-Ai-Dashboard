"use client";

import type { TenantConnection } from "@/lib/plugins";

interface UserMenuProps {
  email: string;
  name?: string | null;
  image?: string | null;
  /** Undefined until the status query lands. */
  status?: TenantConnection;
  /** Re-opens the connect prompt after it has been dismissed. */
  onConnect: () => void;
}

/**
 * The signed-in identity, and the way out.
 *
 * Replaces `AccountSwitcher`, which let one person flip between three hardcoded
 * accounts. That control cannot exist in a multi-user app — the set of accounts is
 * no longer known at build time, and one user must not be offered another's. To
 * use a different Google account you sign out and back in, which is also what
 * makes the session cookie the single source of truth about whose data is on
 * screen.
 *
 * Sign-out is a real form POST: a GET would let any third-party page log the user
 * out with an image tag.
 */
export function UserMenu({
  email,
  name,
  image,
  status,
  onConnect,
}: UserMenuProps) {
  const needsAuth = status?.connected === false;
  const expired = status?.plugins.some((p) => p.state === "needs_reauth");

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/70 p-1 pr-2 backdrop-blur-xl">
        {image ? (
          // Plain <img>: the avatar comes from googleusercontent.com, and routing
          // it through next/image would mean whitelisting that host for no gain.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-lg object-cover"
          />
        ) : (
          <span className="flex size-7 items-center justify-center rounded-lg bg-slate-800 text-xs font-semibold text-slate-300">
            {(name ?? email).slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="flex flex-col leading-tight">
          {name && (
            <span className="text-xs font-semibold text-slate-200">{name}</span>
          )}
          <span className="text-[10px] text-slate-400">{email}</span>
        </div>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="ml-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] font-medium text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            Sign out
          </button>
        </form>
      </div>

      {needsAuth && (
        <button
          type="button"
          onClick={onConnect}
          className="px-1 text-right text-[10px] font-medium text-amber-400 hover:text-amber-300"
        >
          {expired
            ? "Authorization expired, click to reconnect"
            : "Google not connected, click to authorize"}
        </button>
      )}
    </div>
  );
}
