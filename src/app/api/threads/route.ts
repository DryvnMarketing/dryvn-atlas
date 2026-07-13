import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const threads = db
    .prepare(
      `SELECT t.*, p.title AS projectTitle
       FROM threads t JOIN projects p ON p.id = t.projectId
       ORDER BY t.lastMessageAt DESC`
    )
    .all() as { id: number }[];
  const msgStmt = db.prepare(
    "SELECT * FROM messages WHERE threadId = ? ORDER BY sentAt ASC"
  );
  const withMessages = threads.map((t) => ({ ...t, messages: msgStmt.all(t.id) }));
  return NextResponse.json(withMessages);
}
