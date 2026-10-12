import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getDb().prepare("SELECT * FROM portfolio ORDER BY id DESC").all());
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!String(b.title ?? "").trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const skills = Array.isArray(b.skills) ? b.skills : String(b.skills ?? "").split(",");
  const info = getDb().prepare("INSERT INTO portfolio (title, description, skills, link) VALUES (?, ?, ?, ?)")
    .run(b.title.trim(), String(b.description ?? "").trim(),
      JSON.stringify(skills.map((s: string) => s.trim()).filter(Boolean)), String(b.link ?? "").trim());
  logActivity("user", "portfolio_added", b.title);
  return NextResponse.json({ id: Number(info.lastInsertRowid) });
}
