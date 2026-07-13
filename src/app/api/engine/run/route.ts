import { NextResponse } from "next/server";
import { runScoutCycle } from "@/lib/engine";
import { runCommsCycle } from "@/lib/comms-engine";

export async function POST() {
  try {
    const scout = await runScoutCycle();
    const comms = await runCommsCycle();
    return NextResponse.json({ ...scout, comms });
  } catch (err) {
    const cause = err instanceof Error && err.cause ? ` | cause: ${String(err.cause)}` : "";
    return NextResponse.json({ error: `${String(err)}${cause}` }, { status: 500 });
  }
}
