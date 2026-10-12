import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { getPeriodRules } from "@/lib/bidder";

export async function GET() {
  return NextResponse.json(getPeriodRules());
}

// PUT replaces the whole rule table: [{ lowerUsd, upperUsd, days }, ...]
export async function PUT(req: NextRequest) {
  const rules = (await req.json()) as { lowerUsd: number; upperUsd: number; days: number }[];
  const clean = rules
    .map((r) => ({ lowerUsd: Number(r.lowerUsd), upperUsd: Number(r.upperUsd), days: Math.round(Number(r.days)) }))
    .filter((r) => isFinite(r.lowerUsd) && isFinite(r.upperUsd) && r.upperUsd >= r.lowerUsd && r.days >= 1);
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM period_rules").run();
    const ins = db.prepare("INSERT INTO period_rules (lowerUsd, upperUsd, days) VALUES (?, ?, ?)");
    for (const r of clean) ins.run(r.lowerUsd, r.upperUsd, r.days);
  })();
  logActivity("user", "period_rules_updated", `${clean.length} rules`);
  return NextResponse.json(getPeriodRules());
}
