"use client";

import { useState } from "react";
import { ModalPortal } from "./ModalPortal";
import { MessageBody } from "./MessageBody";
import { Avatar } from "./primitives";
import { XIcon } from "./icons";
import { parseSender } from "@/lib/format";

type ViewedMessage = {
  id: string;
  from?: string;
  to?: string;
  subject?: string;
  internalDate?: string;
};

interface MessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Null once closed. The last message is kept on screen while the modal animates out. */
  message: ViewedMessage | null;
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
  // The parent clears `message` the moment it closes; holding the last one
  // keeps the content in place for the exit animation instead of blanking it.
  const [shown, setShown] = useState(message);
  if (message && message !== shown) setShown(message);

  if (!shown) return null;

  const when = formatWhen(shown.internalDate);
  const sender = parseSender(shown.from);

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} cardClassName="max-w-4xl">
      <div className="flex items-start gap-4">
        <Avatar name={sender.name} seed={sender.email} className="size-11 text-sm" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight text-fg sm:text-lg">
            {shown.subject || "No Subject"}
          </h3>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
            <span className="font-medium text-fg">{sender.name}</span>
            {sender.email && sender.email !== sender.name && (
              <span className="truncate text-fg-subtle">&lt;{sender.email}&gt;</span>
            )}
          </div>
          {shown.to && <p className="mt-0.5 truncate text-[11px] text-fg-subtle">to {shown.to}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {when && <span className="hidden text-[11px] text-fg-subtle sm:inline">{when}</span>}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close message"
            className="btn btn-ghost btn-sm btn-icon -mt-1 -mr-2"
          >
            <XIcon />
          </button>
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        {/* Keyed by id so opening a different message refetches from scratch
            rather than briefly showing the previous one's body. */}
        <MessageBody key={shown.id} messageId={shown.id} maxHeightClass="max-h-[70vh]" />
      </div>
    </ModalPortal>
  );
}
