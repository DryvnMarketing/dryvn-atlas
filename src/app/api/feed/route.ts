import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/governor";
import { getPeriodRules, HOURLY_WEEKLY_CAP } from "@/lib/bidder";
import { ALLOWED_CURRENCIES, bidBlockers, normalizeProject, toUsd } from "@/lib/feed";
import { periodForPrice, priceFromBudget } from "@/lib/pricing";
import * as freelancer from "@/lib/freelancer";

const PAGE_SIZE = 20;

// GET /api/feed?q=&type=all|fixed|hourly&page=1&mine=1
// Live Freelancer projects, newest first, annotated with what Atlas would bid and
// whether a bid would be blocked. mine=1 hides currencies outside USD/EUR/GBP/AUD.
export async function GET(req: NextRequest) {
  if (!freelancer.isLive()) {
    return NextResponse.json({ error: "Freelancer isn't connected (no FREELANCER_OAUTH_TOKEN)." }, { status: 503 });
  }
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const type = (sp.get("type") as "fixed" | "hourly" | "all") || "all";
  const mine = sp.get("mine") !== "0";
  const s = getSettings();
  const rules = getPeriodRules();

  try {
    const { projects, total } = await freelancer.fetchFeed({
      query: sp.get("q") || undefined,
      type,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
    const norm = projects.map(normalizeProject);
    const shown = mine ? norm.filter((p) => ALLOWED_CURRENCIES.has(p.currency)) : norm;

    // Which of these we've already bid on (so the UI can't double-bid).
    const ids = shown.map((p) => p.externalId);
    const bidMap = new Map<number, { status: string; amount: number }>();
    if (ids.length) {
      const rows = getDb()
        .prepare(
          `SELECT p.externalId AS externalId, b.status AS status, b.amount AS amount
           FROM bids b JOIN projects p ON p.id = b.projectId
           WHERE p.externalId IN (${ids.map(() => "?").join(",")}) AND b.status IN ('placed','won','lost','pending_approval')
           ORDER BY b.id ASC`
        )
        .all(...ids) as { externalId: number; status: string; amount: number }[];
      for (const r of rows) bidMap.set(r.externalId, { status: r.status, amount: r.amount });
    }

    const cards = shown.map((p) => {
      const amount = priceFromBudget(p.budgetMin, p.budgetMax, s.pricePct);
      const days =
        p.projectType === "hourly"
          ? Math.min(HOURLY_WEEKLY_CAP, p.flags.hourlyHours ?? 10)
          : periodForPrice(toUsd(amount, p.exchangeRate), rules, p.suggestedDays ?? 7);
      return {
        ...p,
        description: p.description.slice(0, 700),
        suggestedAmount: amount,
        suggestedDays: days,
        blockers: bidBlockers(p, s),
        bid: bidMap.get(p.externalId) ?? null,
      };
    });

    return NextResponse.json({
      projects: cards,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      hiddenByCurrency: norm.length - shown.length,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 300) }, { status: 502 });
  }
}
