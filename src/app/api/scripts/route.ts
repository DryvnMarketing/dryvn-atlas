import { NextRequest, NextResponse } from "next/server";
import { listScripts, saveScript } from "@/lib/scripts";
import { logActivity } from "@/lib/db";

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get("all") === "1";
  return NextResponse.json(listScripts(all));
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!String(b.title ?? "").trim() || !String(b.instructions ?? "").trim()) {
    return NextResponse.json({ error: "Title and instructions are required" }, { status: 400 });
  }
  const script = saveScript({ title: b.title, instructions: b.instructions, wordCount: b.wordCount, isDefault: !!b.isDefault });
  logActivity("user", "script_created", script.title);
  return NextResponse.json(script);
}
