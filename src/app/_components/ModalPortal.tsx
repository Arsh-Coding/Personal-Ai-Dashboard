"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePresence } from "./hooks";
import { XIcon } from "./icons";

/**
 * False during the server render and the hydration pass, true afterwards.
 * `document` doesn't exist on the server, so the portal can only be created
 * once mounted — and reading `typeof document` during render instead would
 * make the two passes disagree.
 */
function useIsHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

interface ModalPortalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Width class for the card, e.g. `max-w-md`. */
  cardClassName?: string;
  children: ReactNode;
}

/** How long the exit animation runs before the modal unmounts. */
const EXIT_MS = 170;

/**
 * Overlay + centred card, rendered into `document.body`.
 *
 * The portal is load-bearing, not tidiness: `position: fixed` resolves against
 * the nearest ancestor with a filter, backdrop-filter or transform — not the
 * viewport. Panels in this dashboard use backdrop blur and hover transforms, so
 * a modal rendered inline gets trapped inside its own card: the overlay dims
 * one column and the dialog centres itself in a tall panel, i.e. off-screen,
 * with no reachable way to dismiss it. Portalling to the body restores the
 * viewport as the containing block.
 *
 * Escape and a backdrop click both close, so a modal can never become a
 * dead end that needs a page refresh.
 *
 * Stays mounted for `EXIT_MS` after closing so it can animate out. Callers
 * should keep rendering the same content until then rather than clearing it
 * on close; see `MessageModal` and `CreateEventModal`.
 */
export function ModalPortal({
  isOpen,
  onClose,
  cardClassName = "max-w-lg",
  children,
}: ModalPortalProps) {
  const isHydrated = useIsHydrated();
  const { mounted, closing } = usePresence(isOpen, EXIT_MS);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isHydrated || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className={`fixed inset-0 z-50 flex overflow-y-auto bg-(--ui-overlay) p-4 backdrop-blur-sm sm:p-6 ${
        closing ? "pointer-events-none animate-fade-out" : "animate-fade-in"
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative m-auto w-full rounded-2xl border border-line bg-surface p-6 shadow-pop ${
          closing ? "animate-pop-out" : "animate-pop-in"
        } ${cardClassName}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Icon tile, title, optional subtitle and a close button: the top of every modal. */
export function ModalHeader({
  icon,
  title,
  subtitle,
  onClose,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon && (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-text ring-1 ring-brand/20">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1 pt-0.5">
        <h3 className="text-base font-semibold tracking-tight text-fg">{title}</h3>
        {subtitle && <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">{subtitle}</div>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="btn btn-ghost btn-sm btn-icon -mt-1 -mr-2"
      >
        <XIcon />
      </button>
    </div>
  );
}
