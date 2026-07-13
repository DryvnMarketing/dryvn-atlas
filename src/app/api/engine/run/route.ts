import { NextResponse } from "next/server";
import { runScoutCycle } from "@/lib/engine";

export async function POST() {
  try {
    const result = await runScoutCycle();
    return NextResponse.json(result);
  } catch (err) {
    const cause = err instanceof Error && err.cause ? ` | cause: ${String(err.cause)}` : "";
    return NextResponse.json({ error: `${String(err)}${cause}` }, { status: 500 });
  }
}
