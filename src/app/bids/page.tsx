"use client";

import { useCallback, useEffect, useState } from "react";

interface BidRow {
  id: number;
  projectId: number;
  amount: number;
  periodDays: number;
  proposal: string;
  status: string;
  placedAt: string | null;
  createdAt: string;
  projectTitle: string;
  budgetMin: number;
  budgetMax: number;
  url: string;
  fitScore: number | null;
  fitReason: string | null;
}

const statusStyle: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "var(--ink-muted)" },
  pending_approval: { label: "Needs approval", color: "var(--warning)" },
  approved: { label: "Approved", color: "var(--accent-ink)" },
  placed: { label: "Placed", color: "var(--good)" },
  rejected: { label: "Rejected", color: "var(--serious)" },
  won: { label: "Won", color: "var(--good)" },
  lost: { label: "Lost", color: "var(--ink-muted)" },
};

export default function BidsPage() {
  const [bids, setBids] = useState<BidRow[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/bids");
    setBids(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: number, action: "approve" | "reject") {
    setBusy(id);
    try {
      await fetch(`/api/bids/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Bids pipeline</h1>
        <p className="text-sm text-ink2 mt-0.5">
          Every proposal the Bid agent drafts lands here. Nothing goes live without a green light while approval gate is on.
        </p>
      </header>

      <div className="rounded-lg border border-edge bg-surface divide-y divide-edge">
        {bids.length === 0 && (
          <div className="px-4 py-8 text-sm text-muted">
            No bids yet. Run a scout cycle from the Overview page.
          </div>
        )}
        {bids.map((b) => {
          const st = statusStyle[b.status] ?? { label: b.status, color: "var(--ink-muted)" };
          return (
            <div key={b.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setOpen(open === b.id ? null : b.id)}
                  className="text-left flex-1 min-w-0"
                >
                  <div className="text-sm font-medium truncate">{b.projectTitle}</div>
                  <div className="text-xs text-ink2 mt-0.5">
                    Client budget ${b.budgetMin}–${b.budgetMax} · our bid{" "}
                    <span className="font-mono">${b.amount}</span> / {b.periodDays}d
                    {b.fitScore !== null && <> · fit {Math.round(b.fitScore)}/100</>}
                  </div>
                </button>
                <span className="inline-flex items-center gap-1.5 text-xs shrink-0">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: st.color }} />
                  {st.label}
                </span>
                {b.status === "pending_approval" && (
                  <span className="flex gap-2 shrink-0">
                    <button
                      onClick={() => act(b.id, "approve")}
                      disabled={busy === b.id}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Approve & place
                    </button>
                    <button
                      onClick={() => act(b.id, "reject")}
                      disabled={busy === b.id}
                      className="rounded-md border border-edge px-3 py-1.5 text-xs text-ink2 hover:bg-raised disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </span>
                )}
              </div>
              {open === b.id && (
                <div className="mt-3 rounded-md bg-raised border border-edge px-4 py-3 text-sm text-ink2 whitespace-pre-wrap">
                  {b.fitReason && (
                    <p className="text-xs text-muted mb-2">Scout: {b.fitReason}</p>
                  )}
                  {b.proposal}
                  {b.url && (
                    <p className="mt-2">
                      <a href={b.url} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline text-xs">
                        View project on Freelancer ↗
                      </a>
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
