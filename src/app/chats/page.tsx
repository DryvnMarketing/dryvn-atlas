"use client";

import { useEffect, useState } from "react";

interface Msg {
  id: number;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  sentAt: string;
}
interface ThreadRow {
  id: number;
  projectTitle: string;
  clientName: string;
  lastMessageAt: string;
  messages: Msg[];
}

export default function ChatsPage() {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/threads")
      .then((r) => r.json())
      .then((t: ThreadRow[]) => {
        setThreads(t);
        if (t.length) setSelected(t[0].id);
      });
  }, []);

  const active = threads.find((t) => t.id === selected);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Chats</h1>
        <p className="text-sm text-ink2 mt-0.5">
          Full history of every client conversation. The Comms agent drafts replies; pricing and scope decisions escalate to you.
        </p>
      </header>

      {threads.length === 0 ? (
        <div className="rounded-lg border border-edge bg-surface px-4 py-8 text-sm text-muted">
          No conversations yet. Threads appear here as soon as clients respond to placed bids.
        </div>
      ) : (
        <div className="flex gap-4 min-h-[400px]">
          <div className="w-72 shrink-0 rounded-lg border border-edge bg-surface divide-y divide-edge overflow-hidden">
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={`block w-full text-left px-4 py-3 hover:bg-raised ${selected === t.id ? "bg-raised" : ""}`}
              >
                <div className="text-sm font-medium truncate">{t.clientName || "Client"}</div>
                <div className="text-xs text-ink2 truncate mt-0.5">{t.projectTitle}</div>
                <div className="text-xs text-muted mt-0.5 font-mono">{t.lastMessageAt}</div>
              </button>
            ))}
          </div>
          <div className="flex-1 rounded-lg border border-edge bg-surface p-4 space-y-3 overflow-y-auto">
            {active?.messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[75%] rounded-lg px-4 py-2.5 text-sm ${
                  m.direction === "outbound"
                    ? "ml-auto bg-accent/20 border border-accent/30"
                    : "bg-raised border border-edge"
                }`}
              >
                <div className="text-xs text-muted mb-1">
                  {m.direction === "outbound" ? "DRYVN" : active.clientName || "Client"} ·{" "}
                  <span className="font-mono">{m.sentAt}</span>
                  {m.status === "pending_approval" && (
                    <span className="ml-2" style={{ color: "var(--warning)" }}>
                      ⚠ draft — needs your approval
                    </span>
                  )}
                </div>
                <div className="whitespace-pre-wrap text-ink2">{m.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
