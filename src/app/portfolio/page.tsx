"use client";

import { useCallback, useEffect, useState } from "react";

interface Item { id: number; title: string; description: string; skills: string; link: string }

const blank = { id: 0, title: "", description: "", skills: "", link: "" };

export default function PortfolioPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [attach, setAttach] = useState(false);
  const [editing, setEditing] = useState<typeof blank | null>(null);

  const load = useCallback(async () => {
    setItems(await (await fetch("/api/portfolio")).json());
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((s) => setAttach(!!s.attachPortfolio));
  }, []);

  async function toggleAttach(on: boolean) {
    setAttach(on);
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachPortfolio: on }) });
  }

  async function remove(id: number) {
    await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Portfolio</h1>
          <p className="text-sm text-ink2 mt-0.5 max-w-xl">
            Past work you can point to. When matching is on, the Bid agent mentions the closest match as social proof in a
            proposal. It only ever uses what you enter here and is told never to invent other work, clients or results.
          </p>
        </div>
        <button onClick={() => setEditing({ ...blank })} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90">
          + Add project
        </button>
      </header>

      <section className="rounded-lg border border-edge bg-surface px-4 py-3">
        <label className="flex items-center gap-3 text-sm text-ink2">
          <input type="checkbox" checked={attach} onChange={(e) => toggleAttach(e.target.checked)} />
          <span><b className="text-foreground">Attach matching portfolio</b> — add the best-matching project (by skills and title) to each proposal.</span>
        </label>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((it) => {
          const skills = JSON.parse(it.skills || "[]") as string[];
          return (
            <article key={it.id} className="rounded-lg border border-edge bg-surface p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold">{it.title}</h2>
                <div className="flex gap-2 text-xs shrink-0">
                  <button onClick={() => setEditing({ id: it.id, title: it.title, description: it.description, skills: skills.join(", "), link: it.link })} className="text-accent-ink hover:underline">Edit</button>
                  <button onClick={() => remove(it.id)} className="hover:underline" style={{ color: "var(--serious)" }}>Delete</button>
                </div>
              </div>
              {it.description && <p className="text-sm text-ink2 line-clamp-4">{it.description}</p>}
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => <span key={s} className="text-[11px] rounded border border-edge px-1.5 py-0.5 text-ink2">{s}</span>)}
              </div>
              {it.link && <a href={it.link} target="_blank" rel="noreferrer" className="text-xs text-accent-ink hover:underline">Link ↗</a>}
            </article>
          );
        })}
        {items.length === 0 && (
          <div className="text-sm text-muted sm:col-span-2 py-6">
            Nothing here yet. Add the projects you want Atlas to be able to reference, with the skills each one demonstrates.
          </div>
        )}
      </div>

      {editing && <ItemModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function ItemModal({ initial, onClose, onSaved }: { initial: typeof blank; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const isNew = !initial.id;

  async function save() {
    const res = await fetch(isNew ? "/api/portfolio" : `/api/portfolio/${initial.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    const out = await res.json();
    if (!res.ok) { setErr(out.error ?? "Save failed"); return; }
    onSaved();
  }

  const field = "mt-1 block w-full rounded-md border border-edge bg-raised px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-edge bg-surface p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold">{isNew ? "Add portfolio project" : "Edit portfolio project"}</h2>
        <label className="block text-xs text-ink2">Title
          <input className={field} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </label>
        <label className="block text-xs text-ink2">What it is and what you delivered (facts only)
          <textarea className={field} rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>
        <label className="block text-xs text-ink2">Skills it demonstrates (comma separated, used for matching)
          <input className={field} value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} placeholder="React, Supabase, Dashboard, Admin Panel" />
        </label>
        <label className="block text-xs text-ink2">Link (optional)
          <input className={field} value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />
        </label>
        {err && <div className="text-xs" style={{ color: "var(--serious)" }}>{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-md border border-edge px-4 py-2 text-sm text-ink2 hover:bg-raised">Cancel</button>
          <button onClick={save} disabled={!f.title.trim()} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}
