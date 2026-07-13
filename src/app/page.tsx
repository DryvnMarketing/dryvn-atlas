"use client";

import { useCallback, useEffect, useState } from "react";

interface Overview {
  stats: {
    bidsToday: number;
    bidsPendingApproval: number;
    bidsPlacedTotal: number;
    projectsDiscovered: number;
    projectsActive: number;
    projectsDelivered: number;
  };
  capacity: { canAcceptAward: boolean; reason: string; activeCount: number };
  settings: { bidMinUsd: number; bidMaxUsd: number; maxConcurrentProjects: number; autoBid: boolean };
  activity: { id: number; at: string; agent: string; action: string; detail: string }[];
  integrations: { freelancerLive: boolean; claudeLive: boolean };
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [running, setRunning] = useState(false);
  const [runNote, setRunNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/overview");
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runCycle() {
    setRunning(true);
    setRunNote(null);
    try {
      const res = await fetch("/api/engine/run", { method: "POST" });
      const result = await res.json();
      if (result.error) {
        setRunNote(`Cycle failed: ${result.error}`);
      } else {
        setRunNote(
          `Scout cycle (${result.mode}): ${result.discovered} discovered, ${result.evaluated} evaluated, ${result.drafted} bids drafted, ${result.skipped} skipped.` +
            (result.notes?.length ? ` ${result.notes.join(" ")}` : "")
        );
      }
      await load();
    } finally {
      setRunning(false);
    }
  }

  if (!data) return <div className="text-muted text-sm">Loading…</div>;

  const tiles = [
    { label: "Bids placed today", value: data.stats.bidsToday },
    { label: "Awaiting your approval", value: data.stats.bidsPendingApproval },
    { label: "Bids placed total", value: data.stats.bidsPlacedTotal },
    {
      label: "Active projects",
      value: `${data.stats.projectsActive} / ${data.settings.maxConcurrentProjects}`,
    },
    { label: "Projects discovered", value: data.stats.projectsDiscovered },
    { label: "Delivered", value: data.stats.projectsDelivered },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Overview</h1>
          <p className="text-sm text-ink2 mt-0.5">
            Bid window ${data.settings.bidMinUsd}–${data.settings.bidMaxUsd} · mode:{" "}
            {data.settings.autoBid ? "auto-bid" : "approval gate"}
          </p>
        </div>
        <button
          onClick={runCycle}
          disabled={running}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {running ? "Scouting…" : "Run scout cycle"}
        </button>
      </header>

      {runNote && (
        <div className="rounded-md border border-edge bg-surface px-4 py-3 text-sm text-ink2">
          {runNote}
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-edge bg-surface px-4 py-4">
            <div className="text-2xl font-mono font-semibold tabular-nums">{t.value}</div>
            <div className="text-xs text-ink2 mt-1">{t.label}</div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-edge bg-surface px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <Status ok={data.capacity.canAcceptAward} okText="Capacity available" badText="At capacity" />
        <span className="text-ink2">{data.capacity.reason}</span>
        <span className="ml-auto flex gap-4">
          <Status ok={data.integrations.freelancerLive} okText="Freelancer: live" badText="Freelancer: demo mode" warn />
          <Status ok={data.integrations.claudeLive} okText="Claude: live" badText="Claude: template mode" warn />
        </span>
      </section>

      <section>
        <h2 className="text-sm font-medium text-ink2 mb-2">Agent activity</h2>
        <div className="rounded-lg border border-edge bg-surface divide-y divide-edge">
          {data.activity.length === 0 && (
            <div className="px-4 py-6 text-sm text-muted">
              No activity yet — run a scout cycle to wake the agents up.
            </div>
          )}
          {data.activity.map((a) => (
            <div key={a.id} className="px-4 py-2.5 flex items-baseline gap-3 text-sm">
              <span className="font-mono text-xs text-muted shrink-0 w-32">{a.at}</span>
              <span className="uppercase text-xs tracking-wide text-accent-ink shrink-0 w-16">{a.agent}</span>
              <span className="text-ink2 min-w-0">{a.detail || a.action}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Status({ ok, okText, badText, warn }: { ok: boolean; okText: string; badText: string; warn?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ background: ok ? "var(--good)" : warn ? "var(--warning)" : "var(--serious)" }}
      />
      <span className="text-ink2">{ok ? okText : badText}</span>
    </span>
  );
}
