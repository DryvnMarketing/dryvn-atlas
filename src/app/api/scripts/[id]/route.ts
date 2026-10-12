import { NextRequest, NextResponse } from "next/server";
import { getScript, removeScript, saveScript, setDefaultScript } from "@/lib/scripts";
import { logActivity } from "@/lib/db";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const cur = getScript(id);
  if (!cur) return NextResponse.json({ error: "Script not found" }, { status: 404 });
  const b = await req.json();
  if (b.makeDefault) {
    setDefaultScript(id);
    logActivity("user", "script_default", cur.title);
    return NextResponse.json(getScript(id));
  }
  const script = saveScript({
    id,
    title: b.title ?? cur.title,
    instructions: b.instructions ?? cur.instructions,
    wordCount: b.wordCount ?? cur.wordCount,
  });
  logActivity("user", "script_updated", script.title);
  return NextResponse.json(script);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const cur = getScript(id);
  const result = removeScript(id);
  if (result === "blocked") {
    return NextResponse.json({ error: "The default script can't be removed. Make another script the default first." }, { status: 400 });
  }
  logActivity("user", `script_${result}`, cur?.title ?? String(id));
  return NextResponse.json({ ok: true, result });
}
