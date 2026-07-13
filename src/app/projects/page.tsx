"use client";

import { useEffect, useState } from "react";

interface ProjectRow {
  id: number;
  title: string;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  skills: string;
  postedAt: string;
  url: string;
  fitScore: number | null;
  fitReason: string | null;
  estimatedDays: number | null;
  status: string;
}

const statusColor: Record<string, string> = {
  discovered: "var(--ink-muted)",
  evaluated: "var(--accent-ink)",
  bidding: "var(--accent-ink)",
  awarded: "var(--warning)",
  active: "var(--good)",
  delivered: "var(--good)",
  skipped: "var(--ink-muted)",
  closed: "var(--ink-muted)",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [showSkipped, setShowSkipped] = useState(false);

  useEffect(() => {
    fetch("/api/projects").then((r) => r.json()).then(setProjects);
  }, []);

  const visible = projects.filter((p) => showSkipped || p.status !== "skipped");

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-sm text-ink2 mt-0.5">
            Everything the Scout has seen, scored, and pursued — and what got awarded.
          </p>
        </div>
        <label className="text-xs text-ink2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={showSkipped}
            onChange={(e) => setShowSkipped(e.target.checked)}
          />
          Show skipped
        </label>
      </header>

      <div className="rounded-lg border border-edge bg-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-edge">
              <th className="px-4 py-2.5 font-medium">Project</th>
              <th className="px-4 py-2.5 font-medium">Budget</th>
              <th className="px-4 py-2.5 font-medium">Fit</th>
              <th className="px-4 py-2.5 font-medium">Est. days</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-muted">
                  Nothing yet — run a scout cycle from the Overview page.
                </td>
              </tr>
            )}
            {visible.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 max-w-md">
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium hover:text-accent-ink truncate block"
                    title={p.fitReason ?? undefined}
                  >
                    {p.title}
                  </a>
                  <span className="text-xs text-muted">
                    {(JSON.parse(p.skills || "[]") as string[]).slice(0, 4).join(" · ")}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-ink2 whitespace-nowrap">
                  ${p.budgetMin}–${p.budgetMax}
                </td>
                <td className="px-4 py-3 font-mono text-ink2">
                  {p.fitScore !== null ? `${Math.round(p.fitScore)}` : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-ink2">
                  {p.estimatedDays ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: statusColor[p.status] ?? "var(--ink-muted)" }}
                    />
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
