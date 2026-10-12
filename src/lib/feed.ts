import { getDb } from "./db";
import type { FLProject } from "./freelancer";
import type { ProjectFlags, Settings } from "./types";

// Currencies worth what Atlas's raw budget numbers assume. INR/etc. share the same
// numeric budget buckets on Freelancer but are worth a fraction, so they're excluded.
export const ALLOWED_CURRENCIES = new Set(["USD", "EUR", "GBP", "AUD"]);

/** A Freelancer API project reshaped into Atlas's own row + UI fields. */
export interface NormalizedProject {
  externalId: number;
  title: string;
  description: string;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  currencySign: string;
  exchangeRate: number; // 1 unit of project currency in USD
  projectType: "fixed" | "hourly";
  bidCount: number | null;
  bidAvg: number | null;
  language: string;
  skills: string[];
  postedAt: string;
  url: string;
  flags: ProjectFlags;
  suggestedDays: number | null;
}

export function normalizeProject(p: FLProject): NormalizedProject {
  const min = p.budget?.minimum ?? 0;
  const posted = p.time_submitted ?? p.submitdate ?? 0;
  return {
    externalId: p.id,
    title: p.title,
    description: p.description ?? p.preview_description ?? "",
    budgetMin: min,
    budgetMax: p.budget?.maximum ?? min,
    currency: p.currency?.code ?? "USD",
    currencySign: p.currency?.sign ?? "$",
    exchangeRate: p.currency?.exchange_rate ?? 1,
    projectType: p.type === "hourly" ? "hourly" : "fixed",
    bidCount: p.bid_stats?.bid_count ?? null,
    bidAvg: p.bid_stats?.bid_avg ?? null,
    language: p.language ?? "en",
    skills: (p.jobs ?? []).map((j) => j.name),
    postedAt: new Date(posted * 1000).toISOString(),
    url: `https://www.freelancer.com/projects/${p.seo_url}`,
    suggestedDays: p.bidperiod ?? null,
    flags: {
      pfOnly: !!p.upgrades?.pf_only,
      escrow: !!p.is_escrow_project,
      nda: !!p.upgrades?.NDA,
      sealed: !!p.upgrades?.sealed,
      featured: !!p.upgrades?.featured,
      urgent: !!p.upgrades?.urgent,
      hourlyHours: p.hourly_project_info?.commitment?.hours,
    },
  };
}

export const toUsd = (amount: number, rate: number) => amount * (rate || 1);

export interface Blocker {
  level: "block" | "warn";
  text: string;
}

/**
 * Why a bid might fail or be a poor idea. "block" items are things the Freelancer
 * API has rejected for this account before (language, Preferred-Freelancer-only);
 * checking up front avoids burning a Claude call + a failed placement.
 */
export function bidBlockers(
  p: Pick<NormalizedProject, "flags" | "language" | "projectType" | "budgetMax" | "exchangeRate">,
  s: Pick<Settings, "minFixedUsd" | "minHourlyUsd">
): Blocker[] {
  const out: Blocker[] = [];
  if (p.flags.pfOnly) out.push({ level: "block", text: "Preferred Freelancers only" });
  if (p.language !== "en") out.push({ level: "block", text: `Bids must be in ${p.language.toUpperCase()}` });
  if (p.flags.escrow) out.push({ level: "warn", text: "Needs a linked Escrow.com account" });
  if (p.flags.nda) out.push({ level: "warn", text: "NDA required" });
  const maxUsd = toUsd(p.budgetMax, p.exchangeRate);
  if (p.projectType === "fixed" && s.minFixedUsd > 0 && maxUsd < s.minFixedUsd) {
    out.push({ level: "block", text: `Below your $${s.minFixedUsd} fixed minimum` });
  }
  if (p.projectType === "hourly" && s.minHourlyUsd > 0 && maxUsd < s.minHourlyUsd) {
    out.push({ level: "block", text: `Below your $${s.minHourlyUsd}/hr minimum` });
  }
  return out;
}

/** Insert (or refresh) a project row and return its local id. */
export function upsertProject(n: NormalizedProject): number {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO projects
      (externalId, title, description, budgetMin, budgetMax, currency, skills, postedAt, url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'discovered')`
  ).run(n.externalId, n.title, n.description, n.budgetMin, n.budgetMax, n.currency,
    JSON.stringify(n.skills), n.postedAt, n.url);
  db.prepare(
    `UPDATE projects SET projectType = ?, exchangeRate = ?, bidCount = ?, bidAvg = ?, language = ?, flags = ?
     WHERE externalId = ?`
  ).run(n.projectType, n.exchangeRate, n.bidCount, n.bidAvg, n.language, JSON.stringify(n.flags), n.externalId);
  const row = db.prepare("SELECT id FROM projects WHERE externalId = ?").get(n.externalId) as { id: number };
  return row.id;
}
