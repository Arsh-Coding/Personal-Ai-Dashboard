"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { hashString, initials } from "@/lib/format";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex animate-fade-in flex-col items-center rounded-2xl border border-dashed border-line-strong/70 px-6 py-10 text-center">
      <div className="relative">
        <div className="absolute inset-0 scale-150 rounded-full bg-brand/15 blur-xl" />
        <div className="relative flex size-12 items-center justify-center rounded-2xl border border-line bg-surface text-brand-text shadow-card">
          {icon}
        </div>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-fg">{title}</h3>
      {body && <p className="mt-1 max-w-xs text-xs leading-relaxed text-fg-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const AVATAR_TONES = [
  "from-violet-500 to-indigo-500",
  "from-sky-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-400",
  "from-pink-500 to-rose-400",
  "from-fuchsia-500 to-purple-500",
];

/** Initials on a gradient picked from the name, so a sender keeps one color. */
export function Avatar({
  name,
  seed,
  className = "size-9 text-xs",
}: {
  name: string;
  /** What the color is keyed on; defaults to the name. Use the email when known. */
  seed?: string;
  className?: string;
}) {
  const tone = AVATAR_TONES[hashString(seed || name) % AVATAR_TONES.length];
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br font-semibold text-white ring-2 ring-surface ${tone} ${className}`}
    >
      {initials(name)}
    </span>
  );
}

/**
 * A number that counts up to its value, and from the old value to the new one
 * when it changes.
 *
 * Written to the DOM directly from a frame loop rather than through state, so
 * an animation costs no React renders. The rendered text is always the final
 * value, which is what the server, screen readers and reduced-motion users get.
 */
export function CountUp({
  value,
  decimals = 0,
  durationMs = 900,
}: {
  value: number;
  decimals?: number;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  /** What is on screen right now, so an interrupted count resumes from there. */
  const shown = useRef(0);

  // A layout effect so the starting number is in place before the first paint,
  // instead of the final value flashing for a frame. Under StrictMode's double
  // run, the first pass is cancelled before any frame, so `shown` is untouched
  // and the second pass still animates.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const start = shown.current;
    if (start === value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shown.current = value;
      node.textContent = value.toFixed(decimals);
      return;
    }

    node.textContent = start.toFixed(decimals);
    let frame = 0;
    const began = performance.now();
    const tick = (t: number) => {
      const progress = Math.min(Math.max((t - began) / durationMs, 0), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      shown.current = start + (value - start) * eased;
      node.textContent = shown.current.toFixed(decimals);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, decimals, durationMs]);

  return (
    <span ref={ref} className="tabular-nums">
      {value.toFixed(decimals)}
    </span>
  );
}

/**
 * Equal-width tabs with a sliding highlight. Use for small, mutually exclusive
 * views (Upcoming / Past, All / Unread).
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className = "",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
  className?: string;
}) {
  const index = Math.max(
    options.findIndex((o) => o.value === value),
    0,
  );

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`relative inline-grid rounded-xl border border-line bg-surface-2 p-0.5 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0.5 rounded-[10px] bg-surface shadow-sm ring-1 ring-line transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`relative z-10 flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? "text-fg" : "text-fg-subtle hover:text-fg-muted"
            }`}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={`rounded-full px-1.5 py-px text-[10px] tabular-nums transition-colors ${
                  active ? "bg-brand/15 text-brand-text" : "bg-surface-3 text-fg-subtle"
                }`}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
