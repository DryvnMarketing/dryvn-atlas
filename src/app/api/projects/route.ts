import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const projects = getDb()
    .prepare("SELECT * FROM projects ORDER BY createdAt DESC LIMIT 200")
    .all();
  return NextResponse.json(projects);
}
