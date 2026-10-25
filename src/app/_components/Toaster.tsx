"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertCircleIcon, CheckCircleIcon, InfoIcon, XIcon } from "./icons";

/**
 * Transient confirmations and failures, replacing `alert()`.
 *
 * `alert()` froze the page and read like a crash for what were usually
 * recoverable states ("a sync is already running"). Errors stay longer than
 * successes because they are the ones someone has to read.
 */

type Tone = "success" | "error" | "info";

type ToastInput = { tone?: Tone; title: string; description?: string };
type ToastItem = ToastInput & { id: number; leaving: boolean };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

const DURATION: Record<Tone, number> = { success: 3500, info: 4500, error: 7000 };
const EXIT_MS = 200;
/** Older toasts are dropped beyond this, so a burst can't fill the screen. */
const MAX_VISIBLE = 4;

let nextId = 1;

const TONE_STYLES: Record<Tone, { icon: typeof InfoIcon; className: string }> = {
  success: { icon: CheckCircleIcon, className: "text-emerald-600 dark:text-emerald-400" },
  error: { icon: AlertCircleIcon, className: "text-red-600 dark:text-red-400" },
  info: { icon: InfoIcon, className: "text-brand-text" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId++;
      const tone = input.tone ?? "info";
      setToasts((all) => [...all.slice(-(MAX_VISIBLE - 1)), { ...input, tone, id, leaving: false }]);
      setTimeout(() => dismiss(id), DURATION[tone]);
    },
    [dismiss],
  );

  return (
    <ToastContext value={toast}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-3 top-3 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:top-auto sm:bottom-6 sm:left-6 sm:items-start"
      >
        {toasts.map((t) => {
          const tone = TONE_STYLES[t.tone ?? "info"];
          const Icon = tone.icon;
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-surface/95 p-3.5 pr-2.5 shadow-pop backdrop-blur-xl ${
                t.leaving ? "animate-toast-out" : "animate-toast-in"
              }`}
            >
              <Icon className={`mt-0.5 size-[18px] ${tone.className}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-xs leading-relaxed break-words text-fg-muted">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="btn btn-ghost btn-sm btn-icon -my-1 size-7"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used inside <ToastProvider>");
  return toast;
}
