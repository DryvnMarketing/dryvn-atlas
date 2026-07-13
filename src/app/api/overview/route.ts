import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSettings, checkCapacity } from "@/lib/governor";
import * as freelancer from "@/lib/freelancer";
import { isLive as claudeLive } from "@/lib/agents/claude";

export async function GET() {
  const db = getDb();
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

  const stats = {
    bidsToday: count(`SELECT COUNT(*) n FROM bids WHERE status IN ('placed','won') AND date(createdAt) = date('now')`),
    bidsPendingApproval: count(`SELECT COUNT(*) n FROM bids WHERE status = 'pending_approval'`),
    bidsPlacedTotal: count(`SELECT COUNT(*) n FROM bids WHERE status IN ('placed','won','lost')`),
    projectsDiscovered: count(`SELECT COUNT(*) n FROM projects`),
    projectsActive: count(`SELECT COUNT(*) n FROM projects WHERE status IN ('awarded','active')`),
    projectsDelivered: count(`SELECT COUNT(*) n FROM projects WHERE status = 'delivered'`),
  };

  const capacity = checkCapacity();
  const settings = getSettings();
  const activity = db
    .prepare("SELECT * FROM activity ORDER BY at DESC LIMIT 25")
    .all();

  return NextResponse.json({
    stats,
    capacity,
    settings,
    activity,
    integrations: {
      freelancerLive: freelancer.isLive(),
      claudeLive: claudeLive(),
    },
  });
}
