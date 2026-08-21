"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { ModalPortal } from "./ModalPortal";
import type { TenantId } from "@/lib/tenants";

interface ComposeMailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Account the message is sent from. */
  tenant: TenantId;
}

export function ComposeMailModal({ isOpen, onClose, onSuccess, tenant }: ComposeMailModalProps) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const sendMessage = api.mail.sendMessage.useMutation({
    onSuccess: (res) => {
      if (res.success) {
        setTo("");
        setSubject("");
        setBody("");
        onSuccess();
        onClose();
      } else {
        alert(res.error || "Failed to send email");
      }
    },
  });

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!to || !subject || !body) return;

    sendMessage.mutate({
      tenant,
      to,
      subject,
      body,
    });
  };

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} cardClassName="max-w-lg">
      <h3 className="text-lg font-semibold text-slate-100">Compose Email</h3>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300">To</label>
          <input
            type="email"
            required
            placeholder="recipient@example.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300">Subject</label>
          <input
            type="text"
            required
            placeholder="Project Update"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300">Body</label>
          <textarea
            required
            placeholder="Write your email here..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            rows={5}
          />
        </div>

        <div className="mt-6 flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-800 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={sendMessage.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {sendMessage.isPending ? "Sending..." : "Send Email"}
          </button>
        </div>
      </form>
    </ModalPortal>
  );
}
