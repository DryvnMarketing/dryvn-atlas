"use client";

import { useCallback, useEffect, useState } from "react";

interface Blocker { level: "block" | "warn"; text: string }
interface FeedProject {
  externalId: number;
  title: string;
  description: string;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  currencySign: string;
  projectType: "fixed" | "hourly";
  bidCount: number | null;
  bidAvg: number | null;
  skills: string[];
  postedAt: string;
  url: string;
  suggestedAmount: number;
  suggestedDays: number;
  blockers: Blocker[];
  bid: { status: string; amount: number } | null;
}
interface FeedResponse { projects: FeedProject[]; total: number; page: number; pages: number; hiddenByCurrency: number }
interface ScriptOpt { id: number; title: string; isDefault: boolean; wordCount: number }

const MAX_CHARS = 1500;

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}
const money = (p: FeedProject, n: number) => `${p.currencySign}${Math.round(n).toLocaleString()}`;
const rate = (p: FeedProject) => (p.projectType === "hourly" ? "/hr" : "");

export default function FeedPage() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | "fixed" | "hourly">("all");
  const [mine, setMine] = useState(true);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scripts, setScripts] = useState<ScriptOpt[]>([]);
  const [editing, setEditing] = useState<FeedProject | null>(null);
  const [confirmQuick, setConfirmQuick] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<Record<number, { ok: boolean; msg: string }>>({});
  const [open, setOpen] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ type, page: String(page), mine: mine ? "1" : "0" });
      if (query) sp.set("q", query);
      const res = await fetch(`/api/feed?${sp}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load feed");
      setData(json);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setLoading(false);
    }
  }, [type, page, mine, query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/scripts").then((r) => r.json()).then(setScripts).catch(() => {});
  }, []);

  const defaultScript = scripts.find((s) => s.isDefault);

  async function quickBid(p: FeedProject) {
    setBusy(p.externalId);
    setConfirmQuick(null);
    try {
      const res = await fetch("/api/feed/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalId: p.externalId, mode: "quick" }),
      });
      const out = await res.json();
      setNotice((n) => ({
        ...n,
        [p.externalId]: out.ok
          ? { ok: true, msg: `Bid placed: ${out.currency} ${out.amount} (${out.scriptTitle})` }
          : { ok: false, msg: out.error ?? "Failed" },
      }));
      if (out.ok) load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Live feed</h1>
          <p className="text-sm text-ink2 mt-0.5">
            Every active Freelancer project, newest first. Place a bid with a script, or Quick Bid with your default.
            {data && <> {data.total.toLocaleString()} open projects.</>}
          </p>
        </div>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()); }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects…"
            className="rounded-md border border-edge bg-raised px-3 py-1.5 text-sm w-56"
          />
          <div className="flex rounded-md border border-edge overflow-hidden text-xs">
            {(["all", "fixed", "hourly"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); setPage(1); }}
                className={`px-3 py-1.5 capitalize ${type === t ? "bg-accent text-white" : "text-ink2 hover:bg-raised"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="text-xs text-ink2 flex items-center gap-1.5">
            <input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} />
            USD/EUR/GBP/AUD only
          </label>
        </form>
      </header>

      {error && (
        <div className="rounded-md border px-4 py-3 text-sm" style={{ borderColor: "var(--serious)", color: "var(--serious)" }}>
          {error}
        </div>
      )}
      {loading && !data && <div className="text-sm text-muted">Loading projects…</div>}

      <div className={`space-y-3 ${loading ? "opacity-60" : ""}`}>
        {data?.projects.map((p) => {
          const blocked = p.blockers.some((b) => b.level === "block");
          const note = notice[p.externalId];
          const isOpen = open.has(p.externalId);
          return (
            <article key={p.externalId} className="rounded-lg border border-edge bg-surface p-4 flex gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">{p.title}</h2>
                  <span className={`text-[10px] font-semibold uppercase rounded px-1.5 py-0.5 ${p.projectType === "hourly" ? "bg-purple-500/20 text-purple-300" : "bg-accent/20 text-accent-ink"}`}>
                    {p.projectType}
                  </span>
                  {p.bid && (
                    <span className="text-[10px] font-semibold uppercase rounded px-1.5 py-0.5" style={{ background: "rgba(52,211,153,0.15)", color: "var(--good)" }}>
                      {p.bid.status === "pending_approval" ? "Draft queued" : "Bid placed"} · {money(p, p.bid.amount)}
                    </span>
                  )}
                </div>
                <div className="text-xs mt-1 flex gap-2 text-ink2">
                  <span className="font-medium" style={{ color: "var(--warning)" }}>
                    {money(p, p.budgetMin)} – {money(p, p.budgetMax)} {p.currency}{rate(p)}
                  </span>
                  <span className="text-muted">· {ago(p.postedAt)}</span>
                </div>
                <p className={`text-sm text-ink2 mt-2 whitespace-pre-wrap ${isOpen ? "" : "line-clamp-3"}`}>{p.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {p.skills.slice(0, 7).map((s) => (
                    <span key={s} className="text-[11px] rounded border border-edge px-1.5 py-0.5 text-ink2">{s}</span>
                  ))}
                  {p.skills.length > 7 && <span className="text-[11px] text-muted">+{p.skills.length - 7} more</span>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <button
                    onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(p.externalId)) n.delete(p.externalId); else n.add(p.externalId); return n; })}
                    className="text-accent-ink hover:underline"
                  >
                    {isOpen ? "Show less" : "Read more"}
                  </button>
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">View on Freelancer ↗</a>
                  {p.blockers.map((b) => (
                    <span
                      key={b.text}
                      className="rounded px-1.5 py-0.5 text-[11px]"
                      style={{
                        background: b.level === "block" ? "rgba(248,113,113,0.12)" : "rgba(251,191,36,0.12)",
                        color: b.level === "block" ? "var(--serious)" : "var(--warning)",
                      }}
                    >
                      {b.level === "block" ? "⛔ " : "⚠ "}{b.text}
                    </span>
                  ))}
                </div>
              </div>

              <div className="w-48 shrink-0 border-l border-edge pl-4 flex flex-col gap-2">
                <div className="text-right">
                  <div className="text-lg font-semibold font-mono">
                    {p.bidAvg ? <>{money(p, p.bidAvg)} <span className="text-xs text-muted font-sans">{p.currency}</span></> : "—"}
                  </div>
                  <div className="text-[11px] text-muted uppercase tracking-wide">
                    avg bid · {p.bidCount ?? 0} bid{p.bidCount === 1 ? "" : "s"}
                  </div>
                </div>
                {note && (
                  <div className="text-xs rounded border px-2 py-1.5" style={{ color: note.ok ? "var(--good)" : "var(--serious)", borderColor: note.ok ? "var(--good)" : "var(--serious)" }}>
                    {note.ok ? "✓" : "✗"} {note.msg}
                  </div>
                )}
                {confirmQuick === p.externalId ? (
                  <div className="rounded-md border border-edge bg-raised p-2 text-xs space-y-2">
                    <div>
                      Quick bid <b className="font-mono">{money(p, p.suggestedAmount)}{rate(p)}</b> /{" "}
                      {p.suggestedDays}{p.projectType === "hourly" ? "h/wk" : "d"} using “{defaultScript?.title ?? "default script"}”?
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => quickBid(p)} className="flex-1 rounded bg-accent px-2 py-1 font-medium text-white">Confirm</button>
                      <button onClick={() => setConfirmQuick(null)} className="rounded border border-edge px-2 py-1 text-ink2">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      disabled={!!p.bid || blocked || busy === p.externalId}
                      onClick={() => setEditing(p)}
                      className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                    >
                      Place a bid
                    </button>
                    <button
                      disabled={!!p.bid || blocked || busy === p.externalId}
                      onClick={() => setConfirmQuick(p.externalId)}
                      className="rounded-md border border-edge px-3 py-2 text-sm text-ink2 hover:bg-raised disabled:opacity-40"
                    >
                      {busy === p.externalId ? "Placing…" : "⚡ Quick bid"}
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
        {data && data.projects.length === 0 && (
          <div className="text-sm text-muted px-1 py-6">No projects on this page match. Try another page or untick the currency filter.</div>
        )}
      </div>

      {data && (
        <footer className="flex items-center justify-between text-xs text-ink2 pt-1">
          <span>
            Page {data.page} of {data.pages.toLocaleString()}
            {data.hiddenByCurrency > 0 && <> · {data.hiddenByCurrency} hidden (other currencies)</>}
          </span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-edge px-3 py-1.5 disabled:opacity-40 hover:bg-raised">Previous</button>
            <button disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="rounded border border-edge px-3 py-1.5 disabled:opacity-40 hover:bg-raised">Next</button>
          </div>
        </footer>
      )}

      {editing && (
        <BidModal
          project={editing}
          scripts={scripts}
          onClose={() => setEditing(null)}
          onPlaced={(msg) => {
            setNotice((n) => ({ ...n, [editing.externalId]: { ok: true, msg } }));
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function BidModal({
  project: p, scripts, onClose, onPlaced,
}: { project: FeedProject; scripts: ScriptOpt[]; onClose: () => void; onPlaced: (msg: string) => void }) {
  const [amount, setAmount] = useState(String(p.suggestedAmount));
  const [days, setDays] = useState(String(p.suggestedDays));
  const [scriptId, setScriptId] = useState<number>(scripts.find((s) => s.isDefault)?.id ?? scripts[0]?.id ?? 0);
  const [proposal, setProposal] = useState("");
  const [writing, setWriting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hourly = p.projectType === "hourly";
  const over = proposal.length > MAX_CHARS;

  async function write() {
    setWriting(true);
    setErr(null);
    try {
      const res = await fetch("/api/feed/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalId: p.externalId, mode: "generate", scriptId, amount: Number(amount) || undefined, periodDays: Number(days) || undefined }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "Failed to write proposal");
      setProposal(out.proposal);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setWriting(false);
    }
  }

  async function place() {
    setPlacing(true);
    setErr(null);
    try {
      const res = await fetch("/api/feed/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalId: p.externalId, mode: "place", scriptId, amount: Number(amount), periodDays: Number(days), proposal }),
      });
      const out = await res.json();
      if (!res.ok || !out.ok) throw new Error(out.error ?? "Failed to place bid");
      onPlaced(`Bid placed: ${out.currency} ${out.amount} (${out.scriptTitle})`);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl border border-edge bg-surface p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-base font-semibold">Place bid</h2>
          <p className="text-xs text-muted truncate">{p.title}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-ink2">
            {hourly ? `Hourly rate (${p.currency})` : `Amount (${p.currency})`}
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="mt-1 block w-full rounded-md border border-edge bg-raised px-3 py-2 text-sm font-mono" />
          </label>
          <label className="block text-xs text-ink2">
            {hourly ? "Weekly limit (hours)" : "Delivered in (days)"}
            <input type="number" value={days} onChange={(e) => setDays(e.target.value)}
              className="mt-1 block w-full rounded-md border border-edge bg-raised px-3 py-2 text-sm font-mono" />
          </label>
        </div>
        <div>
          <div className="text-xs text-ink2 mb-1">Script</div>
          <div className="flex gap-2">
            <select value={scriptId} onChange={(e) => setScriptId(Number(e.target.value))}
              className="flex-1 rounded-md border border-edge bg-raised px-3 py-2 text-sm">
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>{s.title}{s.isDefault ? " (default)" : ""} · ~{s.wordCount} words</option>
              ))}
            </select>
            <button onClick={write} disabled={writing}
              className="rounded-md border border-edge px-3 py-2 text-sm text-accent-ink hover:bg-raised disabled:opacity-50">
              {writing ? "Writing…" : "✨ Write proposal"}
            </button>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-ink2 mb-1">
            <span>Proposal</span>
            <span style={{ color: over ? "var(--serious)" : undefined }}>{proposal.length}/{MAX_CHARS} chars · {proposal.trim() ? proposal.trim().split(/\s+/).length : 0} words</span>
          </div>
          <textarea
            value={proposal}
            onChange={(e) => setProposal(e.target.value)}
            rows={9}
            placeholder="Click “Write proposal” to generate one from the selected script, or write your own. Leave empty and Place bid will write it for you."
            className="block w-full rounded-md border border-edge bg-raised px-3 py-2 text-sm"
          />
        </div>
        {err && <div className="text-xs" style={{ color: "var(--serious)" }}>{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-edge px-4 py-2 text-sm text-ink2 hover:bg-raised">Cancel</button>
          <button onClick={place} disabled={placing || over || !Number(amount) || !Number(days)}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {placing ? "Placing…" : "Place bid"}
          </button>
        </div>
      </div>
    </div>
  );
}
