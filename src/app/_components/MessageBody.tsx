"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/trpc/react";
import { Skeleton, Spinner } from "./primitives";
import { AlertCircleIcon, ImageIcon, InfoIcon, PaperclipIcon, ShieldIcon } from "./icons";

interface MessageBodyProps {
  messageId: string;
  /**
   * Tailwind max-height for the frame. The measured content height is applied
   * inline and this caps it, so short mail fits exactly and long mail scrolls
   * inside the frame — which lets the modal give it far more room than an inline
   * panel could without either one hardcoding a viewport calculation.
   */
  maxHeightClass?: string;
}

/** Sanity bound on measurement; the CSS cap is what the user actually sees. */
const MAX_FRAME_HEIGHT = 6000;
const MIN_FRAME_HEIGHT = 120;

function formatSize(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The full body of one message, fetched on demand.
 *
 * Mounted only once the user asks for it, so nothing here costs anything until
 * then — which is the point of splitting body from list. The server hands back a
 * finished, sanitised document; this component's job is to frame it safely and
 * report what was withheld.
 */
export function MessageBody({
  messageId,
  maxHeightClass = "max-h-[70vh]",
}: MessageBodyProps) {
  const [showImages, setShowImages] = useState(false);
  const [height, setHeight] = useState(MIN_FRAME_HEIGHT);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const loadBody = api.mail.getMessageBody.useMutation();

  // Refetched when `showImages` flips, because whether images are stripped is
  // decided server-side — the client never holds a version with them intact.
  useEffect(() => {
    loadBody.mutate({ messageId, showImages });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, showImages]);

  const result = loadBody.data;
  const document = result?.ok ? result.document : null;

  /**
   * Size the frame to its content.
   *
   * Readable only because the sandbox includes `allow-same-origin`; without it the
   * frame gets an opaque origin and `contentDocument` is null. Scripts stay blocked
   * either way, which is what actually contains the email.
   */
  useEffect(() => {
    if (!document) return;
    const frame = frameRef.current;
    if (!frame) return;

    const measure = () => {
      const inner = frame.contentDocument?.documentElement;
      if (!inner) return;
      setHeight(
        Math.min(Math.max(inner.scrollHeight + 8, MIN_FRAME_HEIGHT), MAX_FRAME_HEIGHT),
      );
    };

    frame.addEventListener("load", measure);
    // Late-arriving layout (web fonts, tables reflowing) lands after `load`.
    const retry = window.setTimeout(measure, 250);
    return () => {
      frame.removeEventListener("load", measure);
      window.clearTimeout(retry);
    };
  }, [document]);

  if (loadBody.isPending && !result) {
    return (
      <div aria-busy="true" aria-label="Loading message" className="mt-2 space-y-3 rounded-xl border border-line bg-surface-2/50 p-5">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="mt-5 h-32 w-full rounded-lg" />
      </div>
    );
  }

  if (!result) return null;

  if (!result.ok) {
    return (
      <div role="alert" className="alert alert-danger mt-2">
        <AlertCircleIcon className="mt-px size-4" />
        {result.error}
      </div>
    );
  }

  return (
    <div className="mt-2 animate-fade-in space-y-2.5">
      {result.blockedImages > 0 && (
        <div className="alert alert-warning items-center justify-between">
          <span className="flex items-start gap-2.5">
            <ShieldIcon className="mt-px size-4" />
            <span>
              {result.blockedImages} remote image
              {result.blockedImages === 1 ? "" : "s"} blocked — loading them tells the
              sender you opened this.
            </span>
          </span>
          <button
            type="button"
            onClick={() => setShowImages(true)}
            disabled={loadBody.isPending}
            className="btn btn-sm shrink-0 border border-amber-500/40 bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-100"
          >
            {loadBody.isPending ? <Spinner className="size-3" /> : <ImageIcon className="size-3.5" />}
            {loadBody.isPending ? "Loading..." : "Display images"}
          </button>
        </div>
      )}

      {result.inlineImages > 0 && (
        <div className="alert alert-info">
          <InfoIcon className="mt-px size-4" />
          <span>
            {result.inlineImages} embedded image
            {result.inlineImages === 1 ? "" : "s"} can&apos;t be shown — the sender
            attached {result.inlineImages === 1 ? "it" : "them"} to the message rather
            than linking, and downloading attachments isn&apos;t supported yet.
          </span>
        </div>
      )}

      {result.truncated && (
        <div className="alert alert-info">
          <InfoIcon className="mt-px size-4" />
          This message was too large to show in full and has been truncated.
        </div>
      )}

      {/*
        The email renders in its own document, never in this one. Two things make
        that safe, and both matter: omitting `allow-scripts` is what stops execution,
        and the server-built document carries a restrictive CSP that also blocks the
        fetches a DOM sanitiser can't see (`url()` in a surviving style attribute).

        `allow-same-origin` is present only so the height can be measured. It does
        NOT re-enable scripts. Never add `allow-scripts` alongside it — that pairing
        voids the sandbox entirely.

        `allow-popups` plus `allow-popups-to-escape-sandbox` let a user-clicked link
        open as a normal tab. With scripts off, nothing can open a window on its own.
      */}
      <iframe
        ref={frameRef}
        title="Message content"
        srcDoc={result.document}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        style={{ height }}
        className={`w-full rounded-xl border border-line bg-white ${maxHeightClass}`}
      />

      {result.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.attachments.map((att, idx) => (
            <span
              key={`${att.filename}-${idx}`}
              title={`${att.filename} (${att.mimeType})`}
              className="flex max-w-[240px] items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[11px] text-fg-subtle"
            >
              <PaperclipIcon className="size-3.5" />
              <span className="truncate font-medium text-fg-muted">{att.filename}</span>
              {att.size > 0 && <span className="shrink-0">{formatSize(att.size)}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
