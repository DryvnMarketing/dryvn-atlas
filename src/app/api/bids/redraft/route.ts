import { NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { getSettings } from "@/lib/governor";
import { prepareBid } from "@/lib/bidder";
import { getDefaultScript } from "@/lib/scripts";
import { priceFromBudget } from "@/lib/pricing";
import type { FreelancerProject } from "@/lib/types";

// POST /api/bids/redraft — rewrite every pending proposal with the current
// bid-writer voice. Only touches pending_approval bids; placed/rejected stay.
let running = false;

export async function POST() {
  if (running) {
    return NextResponse.json({ error: "Redraft already running." }, { status: 409 });
  }
  running = true;
  try {
    const db = getDb();
    const s = getSettings();
    const pending = db.prepare(
      `SELECT b.id AS bidId, p.* FROM bids b JOIN projects p ON p.id = b.projectId
       WHERE b.status = 'pending_approval'`
    ).all() as (FreelancerProject & { bidId: number })[];

    let redrafted = 0;
    const failures: number[] = [];
    for (const p of pending) {
      try {
        const script = getDefaultScript();
        const draft = await prepareBid(
          {
            title: p.title,
            description: p.description,
            budgetMin: p.budgetMin,
            budgetMax: p.budgetMax,
            currency: p.currency,
            exchangeRate: p.exchangeRate,
            projectType: p.projectType,
            skills: JSON.parse(p.skills || "[]"),
            estimatedDays: p.estimatedDays,
          },
          { script, amountOverride: Math.min(priceFromBudget(p.budgetMin, p.budgetMax, s.pricePct), s.bidMaxUsd) }
        );
        db.prepare("UPDATE bids SET proposal = ?, amount = ?, periodDays = ?, scriptId = ? WHERE id = ?")
          .run(draft.proposal, draft.amount, draft.periodDays, script.id, p.bidId);
        redrafted++;
      } catch {
        failures.push(p.bidId);
      }
    }
    logActivity("bid", "queue_redrafted", `${redrafted} proposals rewritten${failures.length ? `, ${failures.length} failed` : ""}`);
    return NextResponse.json({ redrafted, failed: failures });
  } finally {
    running = false;
  }
}
