"use client";

import { useCallback, useEffect, useState } from "react";

interface Msg {
  id: number;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  sentAt: string;
  escalateReason: string | null;
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
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t: ThreadRow[] = await (await fetch("/api/threads")).json();
    setThreads(t);
    setSelected((cur) => cur ?? (t.length ? t[0].id : null));
  }, []);

  async function syncNow() {
    setSyncing(true);
    setSyncNote(null);
    try {
      const res = await fetch("/api/comms/run", { method: "POST" });
      const r = await res.json();
      setSyncNote(
        r.error
          ? `Sync failed: ${String(r.error).slice(0, 140)}`
          : `Synced ${r.threadsSynced} conversation(s), ${r.messagesSynced} new message(s), ${r.drafted} reply draft(s) queued.`
      );
      await load();
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  async function act(msgId: number, action: "send" | "discard") {
    setBusy(msgId);
    try {
      const res = await fetch(`/api/messages/${msgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, body: edits[msgId] }),
      });
      const out = await res.json();
      if (out.undeliverable) setSyncNote(out.message);
      else if (out.error) setSyncNote(`Send failed: ${String(out.error).slice(0, 160)}`);
      else setSyncNote(action === "send" ? "Reply sent to client." : "Draft discarded.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  const active = threads.find((t) => t.id === selected);
  const pendingCount = threads.reduce(
    (n, t) => n + t.messages.filter((m) => m.status === "pending_approval").length,
    0
  );

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Chats</h1>
          <p className="text-sm text-ink2 mt-0.5">
            Every client conversation, synced from Freelancer. The Comms agent drafts replies;
            pricing, scope and deadline decisions always escalate to you.
            {pendingCount > 0 && (
              <span className="ml-2" style={{ color: "var(--warning)" }}>
                {pendingCount} draft{pendingCount > 1 ? "s" : ""} awaiting your review.
              </span>
            )}
          </p>
          {syncNote && <p className="text-xs text-ink2 mt-1">{syncNote}</p>}
        </div>
        <button
          onClick={syncNow}
          disabled={syncing}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 shrink-0"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </header>

      {threads.length === 0 ? (
        <div className="rounded-lg border border-edge bg-surface px-4 py-8 text-sm text-muted">
          No conversations yet. Threads appear here automatically when clients respond to placed
          bids (synced on every engine run).
        </div>
      ) : (
        <div className="flex gap-4 min-h-[420px]">
          <div className="w-72 shrink-0 rounded-lg border border-edge bg-surface divide-y divide-edge overflow-hidden">
            {threads.map((t) => {
              const pending = t.messages.some((m) => m.status === "pending_approval");
              return (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`block w-full text-left px-4 py-3 hover:bg-raised ${selected === t.id ? "bg-raised" : ""}`}
                >
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    {pending && (
                      <span aria-hidden className="size-2 rounded-full shrink-0" style={{ background: "var(--warning)" }} />
                    )}
                    {t.clientName || "Client"}
                  </div>
                  <div className="text-xs text-ink2 truncate mt-0.5">{t.projectTitle}</div>
                  <div className="text-xs text-muted mt-0.5 font-mono">{t.lastMessageAt}</div>
                </button>
              );
            })}
          </div>
          <div className="flex-1 rounded-lg border border-edge bg-surface p-4 space-y-3 overflow-y-auto">
            {active?.messages.map((m) => {
              const isDraft = m.status === "pending_approval";
              return (
                <div
                  key={m.id}
                  className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                    m.direction === "outbound"
                      ? `ml-auto ${isDraft ? "border" : "bg-accent/20 border border-accent/30"}`
                      : "bg-raised border border-edge"
                  }`}
                  style={isDraft ? { borderColor: "var(--warning)", background: "rgba(251,191,36,0.06)" } : undefined}
                >
                  <div className="text-xs text-muted mb-1">
                    {m.direction === "outbound" ? "DRYVN" : active.clientName || "Client"} ·{" "}
                    <span className="font-mono">{m.sentAt}</span>
                  </div>
                  {isDraft ? (
                    <div className="space-y-2">
                      {m.escalateReason && (
                        <div className="text-xs font-medium" style={{ color: "var(--warning)" }}>
                          ⚠ Escalated: {m.escalateReason}
                        </div>
                      )}
                      <textarea
                        value={edits[m.id] ?? m.body}
                        onChange={(e) => setEdits((s) => ({ ...s, [m.id]: e.target.value }))}
                        rows={Math.min(10, Math.max(3, (edits[m.id] ?? m.body).split("\n").length + 1))}
                        className="w-full rounded-md border border-edge bg-raised px-3 py-2 text-sm text-ink2"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => act(m.id, "send")}
                          disabled={busy === m.id}
                          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                        >
                          Send to client
                        </button>
                        <button
                          onClick={() => act(m.id, "discard")}
                          disabled={busy === m.id}
                          className="rounded-md border border-edge px-3 py-1.5 text-xs text-ink2 hover:bg-raised disabled:opacity-50"
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-ink2">{m.body}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
