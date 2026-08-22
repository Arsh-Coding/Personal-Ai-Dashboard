"use client";

import {
  TENANTS,
  tenantMeta,
  type TenantAccent,
  type TenantId,
} from "@/lib/tenants";
import type { TenantConnection } from "@/lib/plugins";

/**
 * Selected-tab styling per accent.
 *
 * Keyed by `TenantAccent`, so adding an account with a new accent fails to
 * compile until it's styled here — the previous two-branch conditional just fell
 * through to indigo, which typechecked fine and quietly gave every new account
 * the same colour as Jungleworks.
 *
 * Each value is a complete literal class string on purpose. Tailwind scans source
 * text for class names, so a template like `bg-${accent}-600` produces no CSS.
 */
const ACTIVE_TAB_CLASSES: Record<TenantAccent, string> = {
  purple: "bg-purple-600 text-white shadow-lg shadow-purple-600/20",
  indigo: "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20",
  // Black sits darker than the slate-900/70 track it's on, so a coloured glow
  // reads as nothing. A ring supplies the edge the shadow does for the others.
  black: "bg-black text-white ring-1 ring-slate-500 shadow-lg shadow-black/40",
};

const INACTIVE_TAB_CLASSES =
  "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200";

interface AccountSwitcherProps {
  value: TenantId;
  onChange: (next: TenantId) => void;
  /** Disabled while a sync is in flight, so we don't switch mid-request. */
  disabled?: boolean;
  /** Per-account connection state; undefined until the status query lands. */
  statuses?: Record<TenantId, TenantConnection>;
  /** Re-opens the connect prompt for the active account after it's dismissed. */
  onConnect: () => void;
}

export function AccountSwitcher({
  value,
  onChange,
  disabled,
  statuses,
  onConnect,
}: AccountSwitcherProps) {
  const active = tenantMeta(value);
  const activeStatus = statuses?.[value];

  /** An expired grant reads differently from one that was never set up. */
  const labelFor = (status?: TenantConnection) =>
    status?.plugins.some((p) => p.state === "needs_reauth")
      ? "authorization expired"
      : "not connected";

  return (
    <div className="flex flex-col gap-1">
      <div
        role="tablist"
        aria-label="Connected account"
        className="flex rounded-xl border border-slate-800 bg-slate-900/70 p-1 backdrop-blur-xl"
      >
        {TENANTS.map((t) => {
          const isActive = t.id === value;
          // Undefined while loading — don't flash a warning dot on every account.
          const needsAuth = statuses?.[t.id]?.connected === false;

          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              title={
                needsAuth
                  ? `${t.email} — ${labelFor(statuses?.[t.id])}`
                  : t.email
              }
              disabled={disabled}
              onClick={() => onChange(t.id)}
              className={[
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50",
                isActive
                  ? ACTIVE_TAB_CLASSES[t.accent]
                  : INACTIVE_TAB_CLASSES,
              ].join(" ")}
            >
              {needsAuth && (
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-amber-400"
                />
              )}
              {t.label}
            </button>
          );
        })}
      </div>

      {activeStatus?.connected === false ? (
        <button
          type="button"
          onClick={onConnect}
          className="px-1 text-left text-[10px] font-medium text-amber-400 hover:text-amber-300"
        >
          {active.email} — {labelFor(activeStatus)}, click to authorize
        </button>
      ) : (
        <span className="px-1 text-[10px] text-slate-500">{active.email}</span>
      )}
    </div>
  );
}
