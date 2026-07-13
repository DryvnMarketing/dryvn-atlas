"use client";

import { useEffect, useState } from "react";

interface SettingsForm {
  bidMinUsd: number;
  bidMaxUsd: number;
  maxConcurrentProjects: number;
  smallProjectMinUsd: number;
  smallProjectMaxUsd: number;
  smallProjectCap: number;
  smallProjectWindowDays: number;
  autoBid: boolean;
  autoReply: boolean;
  skills: string;
}

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setForm);
  }, []);

  if (!form) return <div className="text-muted text-sm">Loading…</div>;

  function set<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaved(false);
  }

  async function save() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaved(true);
  }

  const num = (key: keyof SettingsForm, label: string, hint?: string) => (
    <label className="block">
      <span className="text-sm text-ink2">{label}</span>
      <input
        type="number"
        value={form![key] as number}
        onChange={(e) => set(key, Number(e.target.value) as never)}
        className="mt-1 block w-40 rounded-md border border-edge bg-raised px-3 py-2 text-sm font-mono"
      />
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="text-xl font-semibold">Settings & guardrails</h1>
        <p className="text-sm text-ink2 mt-0.5">
          These rules protect DRYVN&apos;s ratings. The agents cannot override them.
        </p>
      </header>

      <section className="rounded-lg border border-edge bg-surface p-5 space-y-4">
        <h2 className="text-sm font-medium">Bid window (month 1)</h2>
        <div className="flex gap-6">
          {num("bidMinUsd", "Minimum ($)")}
          {num("bidMaxUsd", "Maximum ($)")}
        </div>
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5 space-y-4">
        <h2 className="text-sm font-medium">Capacity</h2>
        <div className="flex flex-wrap gap-6">
          {num("maxConcurrentProjects", "Max concurrent projects")}
          {num("smallProjectCap", "Small-project cap", "Only when every project is small")}
        </div>
        <div className="flex flex-wrap gap-6">
          {num("smallProjectMinUsd", "Small project min ($)")}
          {num("smallProjectMaxUsd", "Small project max ($)")}
          {num("smallProjectWindowDays", "Combined delivery window (days)")}
        </div>
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5 space-y-3">
        <h2 className="text-sm font-medium">Autonomy</h2>
        <label className="flex items-center gap-3 text-sm text-ink2">
          <input
            type="checkbox"
            checked={form.autoBid}
            onChange={(e) => set("autoBid", e.target.checked)}
          />
          Auto-bid — place approved-quality bids without waiting for my click
        </label>
        <label className="flex items-center gap-3 text-sm text-ink2">
          <input
            type="checkbox"
            checked={form.autoReply}
            onChange={(e) => set("autoReply", e.target.checked)}
          />
          Auto-reply — send non-escalated chat replies automatically
        </label>
        <p className="text-xs text-muted">
          Award acceptance is always manual — Atlas never signs a project for you.
        </p>
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5 space-y-2">
        <h2 className="text-sm font-medium">Service catalog</h2>
        <p className="text-xs text-muted">One skill per line — what DRYVN sells.</p>
        <textarea
          value={(JSON.parse(form.skills) as string[]).join("\n")}
          onChange={(e) => set("skills", JSON.stringify(e.target.value.split("\n").filter(Boolean)))}
          rows={8}
          className="block w-full rounded-md border border-edge bg-raised px-3 py-2 text-sm"
        />
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Save settings
        </button>
        {saved && <span className="text-sm" style={{ color: "var(--good)" }}>Saved ✓</span>}
      </div>
    </div>
  );
}
