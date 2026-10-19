"use client";

import { ModalPortal } from "./ModalPortal";
import { MessageBody } from "./MessageBody";

interface MessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Null between closing and unmount, so the header has nothing to render. */
  message: {
    id: string;
    from?: string;
    to?: string;
    subject?: string;
    internalDate?: string;
  } | null;
}

function formatWhen(internalDate?: string): string {
  if (!internalDate) return "";
  const at = Number(internalDate);
  if (!Number.isFinite(at) || at <= 0) return "";
  return new Date(at).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Reading one message full-screen.
 *
 * A modal rather than an inline expansion because email is built for a page of its
 * own: the bodies here run to 60 KB of markup with layout tables assuming desktop
 * width, and the mail panel is five of twelve grid columns. Inline, every message
 * rendered into a narrow well and pushed the thread list around as it loaded.
 *
 * Headers live out here in the dashboard's own styling. Only the body goes inside the
 * sandboxed frame, so sender and subject stay legible and consistent no matter what
 * the message does to itself.
 */
export function MessageModal({ isOpen, onClose, message }: MessageModalProps) {
  if (!message) return null;

  const when = formatWhen(message.internalDate);

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} cardClassName="max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-100">
            {message.subject || "No Subject"}
          </h3>
          <p className="mt-1 truncate text-xs text-slate-400">
            {message.from || "Unknown sender"}
          </p>
          {message.to && (
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              to {message.to}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {when && <span className="text-[11px] text-slate-500">{when}</span>}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close message"
            className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-800 pt-4">
        {/* Keyed by id so opening a different message refetches from scratch
            rather than briefly showing the previous one's body. */}
        <MessageBody
          key={message.id}
          messageId={message.id}
          maxHeightClass="max-h-[70vh]"
        />
      </div>
    </ModalPortal>
  );
}
