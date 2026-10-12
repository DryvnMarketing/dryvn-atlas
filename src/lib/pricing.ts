// Competitive pricing for the low-budget volume push: land 3rd cheapest
// (visible in the affordable tier, but not the single lowest bid, which
// tends to read as spam/scam to clients) rather than anchoring near budgetMax.

// Hard price floor, independent of the project's own budgetMin — real work
// isn't worth doing below this regardless of how cheap rivals are bidding.
// (Safe against exceeding budgetMax: the bid window's own bidMinUsd floor
// already keeps sub-$20-max projects out of the pipeline entirely.)
const FLOOR_USD = 20;

export function priceForThirdCheapest(
  rivalAmounts: number[],
  budgetMin: number,
  budgetMax: number
): number {
  const sorted = [...rivalAmounts].sort((a, b) => a - b);
  let target: number;

  if (sorted.length >= 3) {
    // Undercut the current 3rd-cheapest by $1 so we land at rank 3, not 4.
    target = sorted[2] - 1;
  } else if (sorted.length === 2) {
    // Only 2 rivals in — price just above both so a 3rd bid (ours) is unambiguously rank 3.
    target = sorted[1] + 1;
  } else {
    // Not enough rival bids yet to target a rank — price low-but-not-lowest
    // in the band so we're well positioned once more bids land.
    target = budgetMin + (budgetMax - budgetMin) * 0.35;
  }

  return Math.max(FLOOR_USD, Math.min(Math.round(target), budgetMax));
}

/** Default bid: a percentage of the client's max budget, kept inside their stated range. */
export function priceFromBudget(budgetMin: number, budgetMax: number, pct: number): number {
  const target = Math.round((budgetMax * pct) / 100);
  return Math.max(1, Math.min(Math.max(target, budgetMin), budgetMax));
}

/** Days for a bid: first matching price rule (USD), else the fallback. */
export function periodForPrice(
  amountUsd: number,
  rules: { lowerUsd: number; upperUsd: number; days: number }[],
  fallbackDays: number
): number {
  const hit = rules.find((r) => amountUsd >= r.lowerUsd && amountUsd <= r.upperUsd);
  return hit ? hit.days : fallbackDays;
}

/** Freelancer's hard cap on proposal length. Over it, the bid fails to submit. */
export const PROPOSAL_MAX_CHARS = 1500;

export function clampProposal(text: string, max = PROPOSAL_MAX_CHARS): string {
  const t = text.trim();
  if (t.length <= max) return t;
  // Cut at the last sentence end inside the limit so it never ends mid-thought.
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "), cut.lastIndexOf("\n"));
  return (end > max * 0.6 ? cut.slice(0, end + 1) : cut).trim();
}
