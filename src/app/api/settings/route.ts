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
        smallProjectWindowDays = ?, autoBid = ?, autoReply = ?, skills = ?
       WHERE id = 1`
    )
    .run(
      next.bidMinUsd, next.bidMaxUsd, next.maxConcurrentProjects,
      next.smallProjectMinUsd, next.smallProjectMaxUsd, next.smallProjectCap,
      next.smallProjectWindowDays, next.autoBid ? 1 : 0, next.autoReply ? 1 : 0,
      typeof next.skills === "string" ? next.skills : JSON.stringify(next.skills)
    );
  logActivity("user", "settings_updated", JSON.stringify(body));
  return NextResponse.json(getSettings());
}
