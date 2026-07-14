import { NextResponse } from "next/server";
import { runScoutCycle } from "@/lib/engine";
import { runCommsCycle } from "@/lib/comms-engine";

// One cycle at a time — concurrent runs would draft duplicate bids.
let running = false;

export async function POST() {
  if (running) {
    return NextResponse.json(
      { error: "A cycle is already running — give it a few minutes to finish." },
      { status: 409 }
    );
  }
  running = true;
  try {
    const scout = await runScoutCycle();
    const comms = await runCommsCycle();
    return NextResponse.json({ ...scout, comms });
  } catch (err) {
    const cause = err instanceof Error && err.cause ? ` | cause: ${String(err.cause)}` : "";
    return NextResponse.json({ error: `${String(err)}${cause}` }, { status: 500 });
  } finally {
    running = false;
  }
}
