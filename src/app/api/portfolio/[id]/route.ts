import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const b = await req.json();
  const skills = Array.isArray(b.skills) ? b.skills : String(b.skills ?? "").split(",");
  getDb().prepare("UPDATE portfolio SET title = ?, description = ?, skills = ?, link = ? WHERE id = ?")
    .run(String(b.title ?? "").trim(), String(b.description ?? "").trim(),
      JSON.stringify(skills.map((s: string) => s.trim()).filter(Boolean)), String(b.link ?? "").trim(), id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  getDb().prepare("DELETE FROM portfolio WHERE id = ?").run(Number((await ctx.params).id));
  return NextResponse.json({ ok: true });
}
