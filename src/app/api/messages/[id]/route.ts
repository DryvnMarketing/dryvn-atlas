import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import * as freelancer from "@/lib/freelancer";

// PATCH /api/messages/:id  { action: "send" | "discard", body?: string }
// Sends (optionally edited) drafted replies, or discards them.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { action, body } = await req.json();
  const db = getDb();

  const msg = db.prepare(
    `SELECT m.*, t.externalThreadId, t.clientName, p.title AS projectTitle
     FROM messages m
     JOIN threads t ON t.id = m.threadId
     JOIN projects p ON p.id = t.projectId
     WHERE m.id = ?`
  ).get(id) as
    | { id: number; status: string; body: string; externalThreadId: number | null; clientName: string; projectTitle: string }
    | undefined;

  if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });
  if (msg.status !== "pending_approval") {
    return NextResponse.json({ error: `Message is '${msg.status}', not a pending draft` }, { status: 400 });
  }

  if (action === "discard") {
    db.prepare("UPDATE messages SET status = 'discarded' WHERE id = ?").run(id);
    logActivity("user", "reply_discarded", `Draft to ${msg.clientName} on "${msg.projectTitle}"`);
    return NextResponse.json({ ok: true, status: "discarded" });
  }

  if (action === "send") {
    const finalBody = typeof body === "string" && body.trim() ? body.trim() : msg.body;
    if (freelancer.isLive() && msg.externalThreadId) {
      try {
        await freelancer.sendMessage(msg.externalThreadId, finalBody);
      } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 502 });
      }
    }
    db.prepare(
      "UPDATE messages SET body = ?, status = 'sent', sentAt = datetime('now') WHERE id = ?"
    ).run(finalBody, id);
    logActivity("user", "reply_sent", `Reply sent to ${msg.clientName} on "${msg.projectTitle}"`);
    return NextResponse.json({ ok: true, status: "sent" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
