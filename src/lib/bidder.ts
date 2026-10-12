import { getDb } from "./db";
import { getSettings } from "./governor";
import { draftBid } from "./agents/bid-writer";
import { matchPortfolio } from "./portfolio";
import { periodForPrice, priceFromBudget } from "./pricing";
import { toUsd } from "./feed";
import * as freelancer from "./freelancer";
import type { PeriodRule, Script } from "./types";

/** The parts of a project the bidder needs; both DB rows and API projects fit. */
export interface BidTarget {
  title: string;
  description: string;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  exchangeRate: number;
  projectType: "fixed" | "hourly";
  skills: string[];
  suggestedDays?: number | null;
  hourlyHours?: number;
  estimatedDays?: number | null;
}

export interface PreparedBid {
  amount: number;
  periodDays: number; // days for fixed projects, weekly hours for hourly ones
  proposal: string;
  script: Script;
}

// Default weekly-hours limit on hourly bids (the client's stated commitment is often 40).
export const HOURLY_WEEKLY_CAP = 20;

export function getPeriodRules(): PeriodRule[] {
  return getDb().prepare("SELECT * FROM period_rules ORDER BY lowerUsd ASC").all() as PeriodRule[];
}

/**
 * Decide price + period, then write the proposal around them so text and number agree.
 * Order of precedence for price: explicit override > rank price > pricing % of budget.
 */
export async function prepareBid(
  t: BidTarget,
  opts: { script: Script; amountOverride?: number; rankPrice?: number; periodOverride?: number }
): Promise<PreparedBid> {
  const s = getSettings();
  const amount = opts.amountOverride ?? opts.rankPrice ?? priceFromBudget(t.budgetMin, t.budgetMax, s.pricePct);

  let periodDays: number;
  if (opts.periodOverride) periodDays = opts.periodOverride;
  else if (t.projectType === "hourly") periodDays = Math.min(HOURLY_WEEKLY_CAP, Math.max(1, t.hourlyHours ?? 10));
  else {
    const fallback = t.suggestedDays ?? Math.max(2, Math.ceil((t.estimatedDays ?? 4) * 1.4));
    periodDays = periodForPrice(toUsd(amount, t.exchangeRate), getPeriodRules(), fallback);
  }

  const portfolio = s.attachPortfolio ? matchPortfolio(t.skills, t.title) : [];
  const draft = await draftBid(
    {
      title: t.title,
      description: t.description,
      budgetMin: t.budgetMin,
      budgetMax: t.budgetMax,
      skills: JSON.stringify(t.skills),
      estimatedDays: t.estimatedDays ?? null,
      projectType: t.projectType,
      currency: t.currency,
    },
    { script: opts.script, priceOverride: amount, periodOverride: periodDays, portfolio }
  );
  return { amount: draft.amount, periodDays: draft.periodDays, proposal: draft.proposal, script: opts.script };
}

/** Place a bid on Freelancer. Throws with the API's message on failure. */
export async function placeLive(externalId: number, amount: number, periodDays: number, proposal: string) {
  const bidderId = Number(process.env.FREELANCER_USER_ID);
  if (!freelancer.isLive() || !bidderId) throw new Error("Freelancer is not connected (missing token or FREELANCER_USER_ID)");
  return freelancer.placeBid({ projectId: externalId, bidderId, amount, periodDays, description: proposal });
}

/** Store a bid, tagging the script that wrote it (so reply rates can be measured). */
export function recordBid(
  projectId: number,
  p: { amount: number; periodDays: number; proposal: string; scriptId: number },
  status: "placed" | "pending_approval"
): number {
  const db = getDb();
  const info = db
    .prepare("INSERT INTO bids (projectId, amount, periodDays, proposal, status, scriptId) VALUES (?, ?, ?, ?, ?, ?)")
    .run(projectId, p.amount, p.periodDays, p.proposal, status, p.scriptId);
  if (status === "placed") db.prepare("UPDATE bids SET placedAt = datetime('now') WHERE id = ?").run(info.lastInsertRowid);
  return Number(info.lastInsertRowid);
}
