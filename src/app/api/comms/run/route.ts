import { NextResponse } from "next/server";
import { runCommsCycle } from "@/lib/comms-engine";

// Lightweight: sync Freelancer message threads and draft replies WITHOUT
// running the (slower) scout/bidding cycle. Powers the Chats "Sync now" button.
let running = false;

export async function POST() {
  if (running) {
    return NextResponse.json({ error: "A sync is already running." }, { status: 409 });
  }
  running = true;
  try {
    const comms = await runCommsCycle();
    return NextResponse.json(comms);
  } catch (err) {
    const cause = err instanceof Error && err.cause ? ` | cause: ${String(err.cause)}` : "";
    return NextResponse.json({ error: `${String(err)}${cause}` }, { status: 500 });
  } finally {
    running = false;
  }
}
