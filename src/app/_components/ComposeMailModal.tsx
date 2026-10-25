"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { ModalHeader, ModalPortal } from "./ModalPortal";
import { useToast } from "./Toaster";
import { Spinner } from "./primitives";
import { AlertCircleIcon, ComposeIcon, SendIcon } from "./icons";

interface ComposeMailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** Sends as whichever account the session is on — the server decides, not this. */
export function ComposeMailModal({ isOpen, onClose, onSuccess }: ComposeMailModalProps) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const sendMessage = api.mail.sendMessage.useMutation({
    onSuccess: (res) => {
      if (res.success) {
        toast({ tone: "success", title: "Email sent", description: `To ${to}` });
        setTo("");
        setSubject("");
        setBody("");
        setError(null);
        onSuccess();
        onClose();
      } else {
        // Kept in the modal rather than an alert: the draft is still here to fix.
        setError(res.error || "Failed to send email");
      }
    },
    onError: (e) => setError(e.message),
  });

  const submit = () => {
    if (!to || !subject || !body || sendMessage.isPending) return;
    setError(null);
    sendMessage.mutate({ to, subject, body });
  };

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    submit();
  };

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} cardClassName="max-w-lg">
      <ModalHeader
        icon={<ComposeIcon className="size-5" />}
        title="New message"
        subtitle="Sent from your connected Gmail account."
        onClose={onClose}
      />
      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        className="mt-5 space-y-4"
      >
        <div>
          <label htmlFor="compose-to" className="label">
            To
          </label>
          <input
            id="compose-to"
            type="email"
            required
            autoFocus
            placeholder="recipient@example.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label htmlFor="compose-subject" className="label">
            Subject
          </label>
          <input
            id="compose-subject"
            type="text"
            required
            placeholder="Project Update"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label htmlFor="compose-body" className="label">
            Message
          </label>
          <textarea
            id="compose-body"
            required
            placeholder="Write your email here..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="input resize-y leading-relaxed"
            rows={7}
          />
        </div>

        {error && (
          <div role="alert" className="alert alert-danger">
            <AlertCircleIcon className="mt-px size-4" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="hidden text-[11px] text-fg-subtle sm:block">
            <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">Enter</kbd> to send
          </p>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={sendMessage.isPending} className="btn btn-primary">
              {sendMessage.isPending ? <Spinner className="size-3.5" /> : <SendIcon />}
              {sendMessage.isPending ? "Sending..." : "Send email"}
            </button>
          </div>
        </div>
      </form>
    </ModalPortal>
  );
}
