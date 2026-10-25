"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { pluginMeta, type TenantConnection } from "@/lib/plugins";
import { usePresence } from "./hooks";
import { ThemePicker } from "./ThemeToggle";
import { Avatar } from "./primitives";
import { ChevronDownIcon, LinkIcon, LogOutIcon } from "./icons";

interface UserMenuProps {
  email: string;
  name?: string | null;
  image?: string | null;
  /** Undefined until the status query lands. */
  status?: TenantConnection;
  /** Re-opens the connect prompt after it has been dismissed. */
  onConnect: () => void;
}

const STATE_DOT: Record<string, string> = {
  connected: "bg-emerald-500",
  needs_reauth: "bg-amber-500",
  not_connected: "bg-fg-subtle/50",
  missing_credentials: "bg-red-500",
};

const STATE_LABEL: Record<string, string> = {
  connected: "Connected",
  needs_reauth: "Expired",
  not_connected: "Not connected",
  missing_credentials: "Not configured",
};

function UserAvatar({ name, email, image, className }: { name?: string | null; email: string; image?: string | null; className: string }) {
  if (image) {
    // Plain <img>: the avatar comes from googleusercontent.com, and routing
    // it through next/image would mean whitelisting that host for no gain.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" referrerPolicy="no-referrer" className={`rounded-full object-cover ring-2 ring-surface ${className}`} />;
  }
  return <Avatar name={name || email} seed={email} className={className} />;
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
export function UserMenu({ email, name, image, status, onConnect }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const { mounted, closing } = usePresence(open, 150);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const needsAuth = status?.connected === false;
  const expired = status?.plugins.some((p) => p.state === "needs_reauth");

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Account menu"
        className="group flex items-center gap-2 rounded-full border border-line bg-surface p-0.5 pr-2 shadow-xs transition hover:border-line-strong hover:bg-surface-2 active:scale-[0.97]"
      >
        <span className="relative">
          <UserAvatar name={name} email={email} image={image} className="size-8 text-[11px]" />
          {needsAuth && (
            <span className="absolute -top-0.5 -right-0.5 flex size-3">
              <span className="absolute inline-flex size-full animate-ping-slow rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-amber-500 ring-2 ring-surface" />
            </span>
          )}
        </span>
        <ChevronDownIcon
          className={`size-3.5 text-fg-subtle transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {mounted && (
        <div
          id={menuId}
          className={`absolute top-full right-0 z-40 mt-2 w-72 origin-top-right rounded-2xl border border-line bg-surface p-1.5 shadow-pop ${
            closing ? "pointer-events-none animate-pop-out" : "animate-pop-in"
          }`}
        >
          <div className="flex items-center gap-3 p-2.5">
            <UserAvatar name={name} email={email} image={image} className="size-10 text-sm" />
            <div className="min-w-0">
              {name && <p className="truncate text-sm font-semibold text-fg">{name}</p>}
              <p className="truncate text-xs text-fg-subtle">{email}</p>
            </div>
          </div>

          <div className="mx-1 my-1 h-px bg-line" />

          <div className="p-2">
            <p className="text-[10px] font-semibold tracking-wider text-fg-subtle uppercase">
              Connections
            </p>
            <ul className="mt-2 space-y-1.5">
              {(status?.plugins ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between text-xs">
                  <span className="text-fg-muted">{pluginMeta(p.id).label}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
                    <span className={`size-1.5 rounded-full ${STATE_DOT[p.state] ?? "bg-fg-subtle"}`} />
                    {STATE_LABEL[p.state] ?? p.state}
                  </span>
                </li>
              ))}
              {!status && <li className="text-[11px] text-fg-subtle">Checking…</li>}
            </ul>
            {needsAuth && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onConnect();
                }}
                className="btn btn-sm mt-3 w-full border border-amber-500/30 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200"
              >
                <LinkIcon className="size-3.5" />
                {expired ? "Reconnect Google" : "Connect Google"}
              </button>
            )}
          </div>

          <div className="mx-1 my-1 h-px bg-line" />

          <div className="p-2">
            <p className="mb-2 text-[10px] font-semibold tracking-wider text-fg-subtle uppercase">
              Appearance
            </p>
            <ThemePicker />
          </div>

          <div className="mx-1 my-1 h-px bg-line" />

          <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-fg-subtle">
            <Link href="/privacy" className="hover:text-fg">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-fg">
              Terms
            </Link>
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="btn btn-danger btn-sm -mr-1.5">
                <LogOutIcon className="size-3.5" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
