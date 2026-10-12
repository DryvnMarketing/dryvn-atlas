"use client";

import { useCallback, useEffect, useState } from "react";

interface ScriptRow {
  id: number;
  title: string;
  instructions: string;
  wordCount: number;
  isDefault: boolean;
  archived: boolean;
  sends: number;
  replies: number;
  replyRate: number;
  lastUsed: string | null;
}

const blank = { id: 0, title: "", instructions: "", wordCount: 120 };

export default function ScriptsPage() {
  const [scripts, setScripts] = useState<ScriptRow[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [ab, setAb] = useState(false);
  const [editing, setEditing] = useState<typeof blank | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/scripts${showArchived ? "?all=1" : ""}`);
    setScripts(await res.json());
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((s) => setAb(!!s.abTestScripts));
  }, []);

  async function toggleAb(on: boolean) {
    setAb(on);
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ abTestScripts: on }) });
  }

  async function syncReplies() {
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/comms/run", { method: "POST" });
      const out = await res.json();
      setMsg(res.ok ? `Synced: ${out.messagesSynced ?? 0} new message(s)` : out.error ?? "Sync failed");
      await load();
    } finally {
      setSyncing(false);
    }
  }

  const best = scripts.filter((s) => s.sends >= 10).sort((a, b) => b.replyRate - a.replyRate)[0];

  return (
    <div className="space-y-5 max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Scripts</h1>
          <p className="text-sm text-ink2 mt-0.5 max-w-xl">
            A script is a set of writing instructions the Bid agent follows for every proposal. The default script is used by
            Quick Bid and by auto-bids. Reply rates update as clients message back on projects you bid on.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={syncReplies} disabled={syncing}
            className="rounded-md border border-edge px-3 py-2 text-sm text-ink2 hover:bg-raised disabled:opacity-50">
            {syncing ? "Syncing…" : "Sync replies now"}
          </button>
          <button onClick={() => setEditing({ ...blank })}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90">
            + New script
          </button>
        </div>
      </header>

      <section className="rounded-lg border border-edge bg-surface px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-sm text-ink2">
          <input type="checkbox" checked={ab} onChange={(e) => toggleAb(e.target.checked)} />
          <span>
            <b className="text-foreground">A/B test scripts</b> — auto-bids rotate across every active script (the one used least goes next) so you can compare reply rates.
          </span>
        </label>
        <label className="text-xs text-ink2 flex items-center gap-2">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </section>

      {msg && <div className="text-xs text-ink2">{msg}</div>}
      {best && scripts.length > 1 && (
        <div className="text-xs text-ink2">
          Best so far: <b className="text-foreground">{best.title}</b> at {best.replyRate}% replies over {best.sends} sends.
        </div>
      )}

      <div className="rounded-lg border border-edge bg-surface divide-y divide-edge">
        {scripts.map((s) => (
          <button
            key={s.id}
            onClick={() => setEditing({ id: s.id, title: s.title, instructions: s.instructions, wordCount: s.wordCount })}
            className={`w-full text-left px-4 py-3 flex items-center gap-4 hover:bg-raised ${s.archived ? "opacity-50" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{s.title}</span>
                {s.isDefault && <span className="text-[10px] font-semibold uppercase rounded px-1.5 py-0.5 bg-accent/20 text-accent-ink">Default</span>}
                {s.archived && <span className="text-[10px] uppercase rounded px-1.5 py-0.5 border border-edge text-muted">Archived</span>}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {s.sends} sends · {s.replies} replies · ~{s.wordCount} words · last used {s.lastUsed ? s.lastUsed.slice(0, 10) : "never"}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-lg font-semibold font-mono">{s.replyRate}%</div>
              <div className="text-[10px] text-muted uppercase tracking-wide">reply rate</div>
            </div>
          </button>
        ))}
        {scripts.length === 0 && <div className="px-4 py-6 text-sm text-muted">No scripts yet.</div>}
      </div>

      {editing && (
        <ScriptModal
          initial={editing}
          current={scripts.find((s) => s.id === editing.id) ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function ScriptModal({
  initial, current, onClose, onSaved,
}: { initial: typeof blank; current: ScriptRow | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(initial.title);
  const [instructions, setInstructions] = useState(initial.instructions);
  const [wordCount, setWordCount] = useState(String(initial.wordCount));
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isNew = !initial.id;

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(isNew ? "/api/scripts" : `/api/scripts/${initial.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, instructions, wordCount: Number(wordCount) }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "Save failed");
      onSaved();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault() {
    await fetch(`/api/scripts/${initial.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ makeDefault: true }) });
    onSaved();
  }

  async function remove() {
    const res = await fetch(`/api/scripts/${initial.id}`, { method: "DELETE" });
    const out = await res.json();
    if (!res.ok) { setErr(out.error ?? "Delete failed"); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-xl border border-edge bg-surface p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold">{isNew ? "New script" : "Edit script"}</h2>
        <label className="block text-xs text-ink2">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md border border-edge bg-raised px-3 py-2 text-sm" />
        </label>
        {current && (
          <div className="grid grid-cols-4 gap-2 text-center rounded-md border border-edge bg-raised py-2">
            {[["Sends", current.sends], ["Replies", current.replies], ["Reply rate", `${current.replyRate}%`], ["Last used", current.lastUsed ? current.lastUsed.slice(0, 10) : "never"]].map(([k, v]) => (
              <div key={String(k)}>
                <div className="text-[10px] uppercase text-muted">{k}</div>
                <div className="text-sm font-mono font-semibold">{v}</div>
              </div>
            ))}
          </div>
        )}
        <label className="block text-xs text-ink2">
          Instructions (what the Bid agent must do and avoid — voice, structure, banned words…)
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={14}
            className="mt-1 block w-full rounded-md border border-edge bg-raised px-3 py-2 text-sm font-mono" />
          <span className="text-muted">{instructions.length} chars · {instructions.trim() ? instructions.trim().split(/\s+/).length : 0} words</span>
        </label>
        <label className="block text-xs text-ink2">
          Target proposal length (words). Freelancer rejects anything over 1,500 characters, so ~250 is the practical maximum.
          <input type="number" value={wordCount} onChange={(e) => setWordCount(e.target.value)}
            className="mt-1 block w-32 rounded-md border border-edge bg-raised px-3 py-2 text-sm font-mono" />
        </label>
        {err && <div className="text-xs" style={{ color: "var(--serious)" }}>{err}</div>}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex gap-2">
            {!isNew && current && !current.isDefault && (
              <>
                <button onClick={makeDefault} className="rounded-md border border-edge px-3 py-2 text-sm text-accent-ink hover:bg-raised">Make default</button>
                <button onClick={remove} className="rounded-md px-3 py-2 text-sm hover:bg-raised" style={{ color: "var(--serious)" }}>
                  {current.sends > 0 ? "Archive" : "Delete"}
                </button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border border-edge px-4 py-2 text-sm text-ink2 hover:bg-raised">Cancel</button>
            <button onClick={save} disabled={saving || !title.trim() || !instructions.trim()}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {saving ? "Saving…" : isNew ? "Create script" : "Update script"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
