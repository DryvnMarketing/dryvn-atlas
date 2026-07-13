import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const bids = getDb()
    .prepare(
      `SELECT b.*, p.title AS projectTitle, p.budgetMin, p.budgetMax, p.url, p.fitScore, p.fitReason
       FROM bids b JOIN projects p ON p.id = b.projectId
       ORDER BY b.createdAt DESC`
    )
    .all();
  return NextResponse.json(bids);
}
