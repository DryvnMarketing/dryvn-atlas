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
  projectDescription: string;
  projectSkills: string;
  postedAt: string;
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
  const [outcome, setOutcome] = useState<Record<number, { ok: boolean; msg: string }>>({});

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
      const res = await fetch(`/api/bids/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const out = await res.json();
      setOutcome((s) => ({
        ...s,
        [id]: out.error
          ? { ok: false, msg: `Failed: ${String(out.error).slice(0, 160)}` }
          : action === "reject"
            ? { ok: true, msg: "Rejected — will not be placed" }
            : { ok: true, msg: out.live ? "Bid placed on Freelancer" : "Approved (demo — not sent)" },
      }));
      await load();
    } catch (err) {
      setOutcome((s) => ({ ...s, [id]: { ok: false, msg: `Failed: ${String(err).slice(0, 160)}` } }));
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
                {outcome[b.id] && (
                  <span
                    className="text-xs font-medium shrink-0 rounded-md px-3 py-1.5 border"
                    style={{
                      color: outcome[b.id].ok ? "var(--good)" : "var(--serious)",
                      borderColor: outcome[b.id].ok ? "var(--good)" : "var(--serious)",
                      background: outcome[b.id].ok ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)",
                    }}
                  >
                    {outcome[b.id].ok ? "✓" : "✗"} {outcome[b.id].msg}
                  </span>
                )}
                {b.status === "pending_approval" && !outcome[b.id]?.ok && (
                  <span className="flex gap-2 shrink-0">
                    <button
                      onClick={() => act(b.id, "approve")}
                      disabled={busy === b.id}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {busy === b.id ? "Placing…" : "Approve & place"}
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
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-md bg-raised border border-edge px-4 py-3 text-sm text-ink2">
                    <p className="text-xs font-medium tracking-wide text-muted uppercase mb-2">
                      Client brief · posted <span className="font-mono">{b.postedAt?.slice(0, 16).replace("T", " ")}</span>
                    </p>
                    <div className="whitespace-pre-wrap max-h-96 overflow-y-auto">
                      {b.projectDescription?.trim() || "No description synced for this project."}
                    </div>
                    <p className="text-xs text-muted mt-3">
                      Wants: {(JSON.parse(b.projectSkills || "[]") as string[]).join(" · ") || "—"}
                    </p>
                    {b.url && (
                      <p className="mt-2">
                        <a href={b.url} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline text-xs">
                          View project on Freelancer ↗
                        </a>
                      </p>
                    )}
                  </div>
                  <div className="rounded-md bg-raised border border-edge px-4 py-3 text-sm text-ink2">
                    <p className="text-xs font-medium tracking-wide text-muted uppercase mb-2">Our proposal</p>
                    {b.fitReason && (
                      <p className="text-xs text-muted mb-2">Scout: {b.fitReason}</p>
                    )}
                    <div className="whitespace-pre-wrap max-h-96 overflow-y-auto">{b.proposal}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
