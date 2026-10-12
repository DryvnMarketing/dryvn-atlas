import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { getSettings } from "@/lib/governor";
import { placeLive, prepareBid, recordBid } from "@/lib/bidder";
import { bidBlockers, normalizeProject, upsertProject } from "@/lib/feed";
import { getDefaultScript, getScript } from "@/lib/scripts";
import { clampProposal } from "@/lib/pricing";
import * as freelancer from "@/lib/freelancer";

/**
 * POST /api/feed/bid
 *   { externalId, mode: "generate" | "place" | "quick", amount?, periodDays?, scriptId?, proposal?, force?, dryRun? }
 *
 *  generate: write a proposal with the chosen script and return it (nothing is sent).
 *  place:    send the bid as edited in the modal (writes the proposal first if none given).
 *  quick:    one click. Default script, configured pricing %, period rules, placed immediately.
 *  dryRun:   do everything except contacting Freelancer / saving the bid (for testing).
 */
export async function POST(req: NextRequest) {
  const b = await req.json();
  const externalId = Number(b.externalId);
  const mode = b.mode as "generate" | "place" | "quick";
  if (!externalId || !["generate", "place", "quick"].includes(mode)) {
    return NextResponse.json({ error: "externalId and a valid mode are required" }, { status: 400 });
  }
  const s = getSettings();

  try {
    const fl = await freelancer.getProject(externalId);
    const p = normalizeProject(fl);

    const existing = getDb()
      .prepare(
        `SELECT b.status FROM bids b JOIN projects pr ON pr.id = b.projectId
         WHERE pr.externalId = ? AND b.status IN ('placed','won','lost')`
      )
      .get(externalId);
    if (existing && mode !== "generate") {
      return NextResponse.json({ error: "You have already bid on this project." }, { status: 409 });
    }

    const blockers = bidBlockers(p, s).filter((x) => x.level === "block");
    if (blockers.length && mode !== "generate" && !b.force) {
      return NextResponse.json(
        { error: `Cannot bid: ${blockers.map((x) => x.text).join("; ")}`, blockers },
        { status: 422 }
      );
    }

    const script = (b.scriptId ? getScript(Number(b.scriptId)) : null) ?? getDefaultScript();
    const target = {
      title: p.title,
      description: p.description,
      budgetMin: p.budgetMin,
      budgetMax: p.budgetMax,
      currency: p.currency,
      exchangeRate: p.exchangeRate,
      projectType: p.projectType,
      skills: p.skills,
      suggestedDays: p.suggestedDays,
      hourlyHours: p.flags.hourlyHours,
    };

    // Use the user's edited proposal if they gave one; otherwise write it.
    let amount: number | undefined = b.amount ? Number(b.amount) : undefined;
    let periodDays: number | undefined = b.periodDays ? Number(b.periodDays) : undefined;
    let proposal: string | undefined =
      typeof b.proposal === "string" && b.proposal.trim() ? clampProposal(b.proposal) : undefined;

    if (mode === "generate" || !proposal) {
      const prepared = await prepareBid(target, { script, amountOverride: amount, periodOverride: periodDays });
      amount = prepared.amount;
      periodDays = periodDays ?? prepared.periodDays;
      proposal = prepared.proposal;
      if (mode === "generate") {
        return NextResponse.json({ amount, periodDays, proposal, scriptId: script.id, scriptTitle: script.title });
      }
    }
    if (!amount || !periodDays) {
      return NextResponse.json({ error: "Amount and period are required" }, { status: 400 });
    }

    if (b.dryRun) {
      return NextResponse.json({
        dryRun: true,
        wouldPlace: {
          externalId, amount, periodDays, currency: p.currency, type: p.projectType,
          scriptId: script.id, chars: proposal.length, proposal,
        },
      });
    }

    await placeLive(externalId, amount, periodDays, proposal);

    const projectId = upsertProject(p);
    recordBid(projectId, { amount, periodDays, proposal, scriptId: script.id }, "placed");
    getDb().prepare("UPDATE projects SET status = 'bidding' WHERE id = ?").run(projectId);
    logActivity(
      "user",
      mode === "quick" ? "quick_bid" : "feed_bid",
      `${amount} ${p.currency} / ${periodDays}${p.projectType === "hourly" ? "h/wk" : "d"} on "${p.title}" (script "${script.title}")`
    );
    return NextResponse.json({ ok: true, amount, periodDays, currency: p.currency, scriptTitle: script.title });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 400) }, { status: 502 });
  }
}
