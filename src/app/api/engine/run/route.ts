import { NextResponse } from "next/server";
import { runScoutCycle } from "@/lib/engine";

export async function POST() {
  try {
    const result = await runScoutCycle();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
