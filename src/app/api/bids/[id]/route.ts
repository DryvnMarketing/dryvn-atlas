import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import * as freelancer from "@/lib/freelancer";

// PATCH /api/bids/:id  { action: "approve" | "reject" | "place" }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { action } = await req.json();
  const db = getDb();
  const bid = db
    .prepare(
      `SELECT b.*, p.externalId FROM bids b JOIN projects p ON p.id = b.projectId WHERE b.id = ?`
    )
    .get(id) as { id: number; externalId: number | null; amount: number; periodDays: number; proposal: string } | undefined;
  if (!bid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });

  if (action === "reject") {
    db.prepare("UPDATE bids SET status = 'rejected' WHERE id = ?").run(id);
    logActivity("user", "bid_rejected", `Bid #${id}`);
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  if (action === "approve" || action === "place") {
    if (freelancer.isLive() && process.env.FREELANCER_USER_ID) {
      try {
        await freelancer.placeBid({
          projectId: bid.externalId!,
          bidderId: Number(process.env.FREELANCER_USER_ID),
          amount: bid.amount,
          periodDays: bid.periodDays,
          description: bid.proposal,
        });
        db.prepare("UPDATE bids SET status = 'placed', placedAt = datetime('now') WHERE id = ?").run(id);
        logActivity("bid", "bid_placed_live", `Bid #${id} placed on Freelancer`);
        return NextResponse.json({ ok: true, status: "placed", live: true });
      } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 502 });
      }
    }
    // Demo mode: mark as placed locally
    db.prepare("UPDATE bids SET status = 'placed', placedAt = datetime('now') WHERE id = ?").run(id);
    logActivity("user", "bid_approved_demo", `Bid #${id} approved (demo mode — not sent live)`);
    return NextResponse.json({ ok: true, status: "placed", live: false });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
