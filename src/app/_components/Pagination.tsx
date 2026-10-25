"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

type Slot = number | "gap-start" | "gap-end";

/**
 * Page numbers to show: always the first and last, the current page and one
 * either side, with gaps collapsed. At most seven slots, so it fits the narrow
 * mail column.
 */
function slots(page: number, pageCount: number): Slot[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const result: Slot[] = [1];
  const from = Math.max(2, Math.min(page - 1, pageCount - 4));
  const to = Math.min(pageCount - 1, Math.max(page + 1, 5));
  if (from > 2) result.push("gap-start");
  for (let p = from; p <= to; p++) result.push(p);
  if (to < pageCount - 1) result.push("gap-end");
  result.push(pageCount);
  return result;
}

interface PaginationProps {
  page: number;
  pageCount: number;
  /** Zero-based index of the first item on this page. */
  start: number;
  /** One past the last item on this page. */
  end: number;
  total: number;
  onChange: (page: number) => void;
  /** Plural noun for the range label and the nav's accessible name. */
  noun: string;
}

export function Pagination({ page, pageCount, start, end, total, onChange, noun }: PaginationProps) {
  if (total === 0) return null;

  return (
    <nav
      aria-label={`${noun} pages`}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"
    >
      <p className="text-xs text-fg-subtle" aria-live="polite">
        <span className="font-medium text-fg-muted tabular-nums">
          {start + 1}–{end}
        </span>{" "}
        of <span className="tabular-nums">{total}</span> {noun}
      </p>

      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(page - 1)}
            disabled={page === 1}
            aria-label="Previous page"
            className="btn btn-ghost btn-sm btn-icon"
          >
            <ChevronLeftIcon />
          </button>

          {slots(page, pageCount).map((slot) =>
            typeof slot === "number" ? (
              <button
                key={slot}
                type="button"
                onClick={() => onChange(slot)}
                aria-label={`Page ${slot}`}
                aria-current={slot === page ? "page" : undefined}
                className={`btn btn-sm min-w-8 px-2 tabular-nums ${
                  slot === page
                    ? "btn-primary scale-105 shadow-[0_6px_16px_-6px_var(--ui-brand)]"
                    : "btn-ghost"
                }`}
              >
                {slot}
              </button>
            ) : (
              <span key={slot} aria-hidden="true" className="px-1 text-xs text-fg-subtle">
                …
              </span>
            ),
          )}

          <button
            type="button"
            onClick={() => onChange(page + 1)}
            disabled={page === pageCount}
            aria-label="Next page"
            className="btn btn-ghost btn-sm btn-icon"
          >
            <ChevronRightIcon />
          </button>
        </div>
      )}
    </nav>
  );
}
