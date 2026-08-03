"use client";

import { TENANTS, tenantMeta, type TenantId } from "@/lib/tenants";
import type { TenantConnection } from "@/lib/plugins";

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
              title={needsAuth ? `${t.email} — not connected` : t.email}
              disabled={disabled}
              onClick={() => onChange(t.id)}
              className={[
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50",
                isActive
                  ? t.accent === "purple"
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                    : "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200",
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
          {active.email} — not connected, click to authorize
        </button>
      ) : (
        <span className="px-1 text-[10px] text-slate-500">{active.email}</span>
      )}
    </div>
  );
}
