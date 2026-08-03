"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

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

/**
 * Overlay + centred card, rendered into `document.body`.
 *
 * The portal is load-bearing, not tidiness: `position: fixed` resolves against
 * the nearest ancestor with a filter, backdrop-filter or transform — not the
 * viewport. Every panel in this dashboard is `backdrop-blur-xl`, so a modal
 * rendered inline gets trapped inside its own card: the overlay dims one
 * column and the dialog centres itself in a tall panel, i.e. off-screen, with
 * no reachable way to dismiss it. Portalling to the body restores the viewport
 * as the containing block.
 *
 * Escape and a backdrop click both close, so a modal can never become a
 * dead end that needs a page refresh.
 */
export function ModalPortal({
  isOpen,
  onClose,
  cardClassName = "max-w-lg",
  children,
}: ModalPortalProps) {
  const isHydrated = useIsHydrated();

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

  if (!isHydrated || !isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl ${cardClassName}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
