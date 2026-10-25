"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  type Theme,
  type ThemePreference,
} from "@/lib/theme";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";

/*
 * The theme is DOM state, not React state: `THEME_INIT_SCRIPT` sets
 * `<html data-theme>` before React exists, and everything visual reads that
 * attribute through CSS. React subscribes to it here only to label controls.
 */

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  // Only matters while following the OS; an explicit choice ignores it.
  const onSystemChange = () => {
    if (readPreference() !== "system") return;
    applyTheme(systemTheme());
    emit();
  };
  // Another tab changed the preference.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY && e.key !== null) return;
    const preference = readPreference();
    applyTheme(preference === "system" ? systemTheme() : preference);
    emit();
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** A string so it compares by value; `useSyncExternalStore` needs a stable snapshot. */
function getSnapshot() {
  const theme = document.documentElement.getAttribute("data-theme") ?? DEFAULT_THEME;
  return `${readPreference()}:${theme}`;
}

const getServerSnapshot = () => `system:${DEFAULT_THEME}`;

/**
 * Pick a theme. With an `origin` (the click point), the new theme spreads out
 * from it as a circle where the browser supports view transitions; otherwise,
 * or with reduced motion, it swaps in place.
 */
export function setThemePreference(next: ThemePreference, origin?: { x: number; y: number }) {
  try {
    if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage blocked: the choice still applies to this page.
  }

  const theme = next === "system" ? systemTheme() : next;
  const root = document.documentElement;
  const swap = () => {
    applyTheme(theme);
    emit();
  };

  const unchanged = root.getAttribute("data-theme") === theme;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (unchanged || reducedMotion || typeof document.startViewTransition !== "function") {
    swap();
    return;
  }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? 0;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  root.style.setProperty("--vt-x", `${x}px`);
  root.style.setProperty("--vt-y", `${y}px`);
  root.style.setProperty("--vt-r", `${radius}px`);
  root.classList.add("theme-transition");

  const transition = document.startViewTransition(swap);
  transition.finished.finally(() => root.classList.remove("theme-transition"));
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [preference, theme] = snapshot.split(":") as [ThemePreference, Theme];
  return { preference, theme };
}

/**
 * One-click light/dark switch.
 *
 * Which icon shows is decided by CSS from `data-theme`, not by React, so the
 * server-rendered button is already right before hydration and never flips.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme } = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setThemePreference(next, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`btn btn-ghost btn-icon relative overflow-hidden ${className}`}
    >
      <SunIcon className="absolute size-[18px] rotate-0 scale-100 opacity-100 transition-all duration-500 dark:-rotate-90 dark:scale-50 dark:opacity-0" />
      <MoonIcon className="absolute size-[18px] rotate-90 scale-50 opacity-0 transition-all duration-500 dark:rotate-0 dark:scale-100 dark:opacity-100" />
    </button>
  );
}

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
];

/** Light / Dark / System, for menus. The only way back to following the OS. */
export function ThemePicker() {
  const { preference } = useTheme();
  const index = OPTIONS.findIndex((o) => o.value === preference);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="relative grid grid-cols-3 rounded-xl border border-line bg-surface-2 p-0.5"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-[10px] bg-surface shadow-sm ring-1 ring-line transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: `translateX(${Math.max(index, 0) * 100}%)` }}
      />
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setThemePreference(value, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
          }}
          className={`relative z-10 flex items-center justify-center gap-1.5 rounded-[10px] py-1.5 text-xs font-medium transition-colors ${
            preference === value ? "text-fg" : "text-fg-subtle hover:text-fg-muted"
          }`}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
