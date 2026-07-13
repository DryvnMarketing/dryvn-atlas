import { getDb } from "./db";
import type { Settings } from "./types";

// The capacity governor enforces DRYVN's non-negotiable delivery rules.
// Ratings and brand quality outrank booking volume.

export function getSettings(): Settings {
  const row = getDb().prepare("SELECT * FROM settings WHERE id = 1").get() as
    Settings & { autoBid: number; autoReply: number };
  return { ...row, autoBid: !!row.autoBid, autoReply: !!row.autoReply };
}

export interface CapacityCheck {
  canBid: boolean;
  canAcceptAward: boolean;
  reason: string;
  activeCount: number;
}

interface ActiveProject {
  budgetMax: number;
  estimatedDays: number | null;
}

/**
 * Rules (user-specified):
 * - Never more than maxConcurrentProjects (3) active at once…
 * - …EXCEPT up to smallProjectCap (5) when every active project is small
 *   ($200–$300) and the combined delivery estimate fits inside
 *   smallProjectWindowDays (5 days).
 * - Bidding itself may continue while at capacity (bids take days to convert),
 *   but award acceptance is blocked — and is ALWAYS a human click anyway.
 */
export function checkCapacity(candidateBudget?: number): CapacityCheck {
  const s = getSettings();
  const active = getDb()
    .prepare(
      "SELECT budgetMax, estimatedDays FROM projects WHERE status IN ('awarded','active')"
    )
    .all() as ActiveProject[];

  const count = active.length;

  if (count < s.maxConcurrentProjects) {
    return {
      canBid: true,
      canAcceptAward: true,
      reason: `${count}/${s.maxConcurrentProjects} project slots in use`,
      activeCount: count,
    };
  }

  // At or over the standard cap — small-project exception?
  const withCandidate = candidateBudget !== undefined
    ? [...active, { budgetMax: candidateBudget, estimatedDays: null }]
    : active;

  const allSmall = withCandidate.every(
    (p) => p.budgetMax >= s.smallProjectMinUsd && p.budgetMax <= s.smallProjectMaxUsd
  );
  const totalDays = withCandidate.reduce((sum, p) => sum + (p.estimatedDays ?? 2), 0);
  const fitsWindow = totalDays <= s.smallProjectWindowDays;
  const underSmallCap = withCandidate.length <= s.smallProjectCap;

  if (allSmall && fitsWindow && underSmallCap) {
    return {
      canBid: true,
      canAcceptAward: true,
      reason: `Small-project exception: ${withCandidate.length}/${s.smallProjectCap} small projects, ~${totalDays}d combined (≤${s.smallProjectWindowDays}d window)`,
      activeCount: count,
    };
  }

  return {
    canBid: true, // keep pipeline warm; conversion takes days
    canAcceptAward: false,
    reason: `At capacity (${count} active). Small-project exception not met: ${
      !allSmall ? "not all projects are $200–$300 range" :
      !fitsWindow ? `combined estimate ${totalDays}d exceeds ${s.smallProjectWindowDays}d window` :
      "small-project cap reached"
    }`,
    activeCount: count,
  };
}

/** Month-1 bid window: only projects overlapping the $150–$600 band. */
export function inBidWindow(budgetMin: number, budgetMax: number): boolean {
  const s = getSettings();
  return budgetMax >= s.bidMinUsd && budgetMin <= s.bidMaxUsd;
}
