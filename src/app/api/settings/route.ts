import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { getSettings } from "@/lib/governor";

export async function GET() {
  return NextResponse.json(getSettings());
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const s = getSettings();
  const next = { ...s, ...body };
  getDb()
    .prepare(
      `UPDATE settings SET
        bidMinUsd = ?, bidMaxUsd = ?, maxConcurrentProjects = ?,
        smallProjectMinUsd = ?, smallProjectMaxUsd = ?, smallProjectCap = ?,
        smallProjectWindowDays = ?, autoBid = ?, autoReply = ?, skills = ?,
        pricePct = ?, minFixedUsd = ?, minHourlyUsd = ?, attachPortfolio = ?, abTestScripts = ?
       WHERE id = 1`
    )
    .run(
      next.bidMinUsd, next.bidMaxUsd, next.maxConcurrentProjects,
      next.smallProjectMinUsd, next.smallProjectMaxUsd, next.smallProjectCap,
      next.smallProjectWindowDays, next.autoBid ? 1 : 0, next.autoReply ? 1 : 0,
      typeof next.skills === "string" ? next.skills : JSON.stringify(next.skills),
      Math.min(100, Math.max(1, Number(next.pricePct) || 92)),
      Math.max(0, Number(next.minFixedUsd) || 0),
      Math.max(0, Number(next.minHourlyUsd) || 0),
      next.attachPortfolio ? 1 : 0,
      next.abTestScripts ? 1 : 0
    );
  logActivity("user", "settings_updated", JSON.stringify(body));
  return NextResponse.json(getSettings());
}
