import { NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { getSettings } from "@/lib/governor";
import { draftBid } from "@/lib/agents/bid-writer";
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
        const draft = await draftBid(p);
        db.prepare("UPDATE bids SET proposal = ?, amount = ?, periodDays = ? WHERE id = ?")
          .run(draft.proposal, Math.min(draft.amount, s.bidMaxUsd), draft.periodDays, p.bidId);
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
