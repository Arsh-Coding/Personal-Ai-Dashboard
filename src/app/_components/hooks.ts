import { useEffect, useState, useSyncExternalStore } from "react";

/* -------------------------------------------------------------------------- */
/* Clock                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One shared clock for every countdown on the page ("in 12 min", "Now").
 *
 * An external store rather than `Date.now()` in render: render has to be pure,
 * and a single interval for the whole page beats one per card. The tick only
 * runs while something is subscribed.
 */
const TICK_MS = 30_000;
let clockNow = 0;
let clockTimer: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (!clockTimer) {
    // Refreshed on first subscribe, so a value from a previous mount is never
    // served stale.
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      clockListeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

/**
 * Milliseconds since the epoch, refreshed every 30 seconds. `0` during the
 * server render and hydration, so nothing time-dependent can mismatch; render
 * time-based UI only once it is non-zero.
 */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeClock,
    // Initialised lazily so a component mounting after hydration gets a real
    // time on its first render, not 1970. Cached after that, as the store
    // contract requires.
    () => clockNow || (clockNow = Date.now()),
    () => 0,
  );
}

/* -------------------------------------------------------------------------- */
/* Presence                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Keeps something mounted for `exitMs` after `open` turns false, so it can
 * play an exit animation instead of vanishing.
 *
 * `closing` is true during that window: render the exit animation and drop
 * pointer events while it is.
 */
export function usePresence(open: boolean, exitMs = 180) {
  const [mounted, setMounted] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);

  // Adjusting state during render, so opening shows the element in the same
  // pass rather than one effect later.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMounted(true);
  }

  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted: open || mounted, closing: !open && mounted };
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Client-side paging over an already-loaded list.
 *
 * `resetKey` returns to page 1 whenever it changes: pass the active filter or
 * search text so a narrower result never opens on an empty page 4. The page
 * is also clamped on every render, so a list that shrinks under the user (a
 * sync, a deletion) lands on its new last page rather than nowhere.
 *
 * `direction` is which way the last move went, for a directional transition.
 */
export function usePagination<T>(items: readonly T[], pageSize: number, resetKey: string = "") {
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [lastKey, setLastKey] = useState(resetKey);

  if (resetKey !== lastKey) {
    setLastKey(resetKey);
    setPage(1);
    setDirection(1);
  }

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  const end = Math.min(start + pageSize, items.length);

  const goTo = (next: number) => {
    const target = Math.min(Math.max(1, next), pageCount);
    if (target === current) return;
    setDirection(target > current ? 1 : -1);
    setPage(target);
  };

  return {
    page: current,
    pageCount,
    direction,
    start,
    end,
    total: items.length,
    pageItems: items.slice(start, end),
    goTo,
  };
}
