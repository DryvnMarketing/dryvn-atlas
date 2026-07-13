import { complete, isLive as claudeLive, DRYVN_VOICE } from "./claude";
import type { FreelancerProject } from "../types";

export interface BidDraft {
  amount: number;
  periodDays: number;
  proposal: string;
}

/**
 * Bid agent: writes an outcome-priced proposal. Prices toward the top of the
 * client's band when the value story supports it (the "$3.5K budget, closed
 * at $5K" play — scaled to our month-1 window).
 */
export async function draftBid(
  project: Pick<FreelancerProject, "title" | "description" | "budgetMin" | "budgetMax" | "skills" | "estimatedDays">
): Promise<BidDraft> {
  const anchor = Math.round(project.budgetMax * 0.92);
  const periodDays = Math.max(2, Math.ceil((project.estimatedDays ?? 4) * 1.4)); // buffer for quality

  if (!claudeLive()) {
    return {
      amount: anchor,
      periodDays,
      proposal: `Hi! DRYVN here — we build ${JSON.parse(project.skills || "[]").slice(0, 2).join(" and ") || "digital products"} end-to-end, in-house. We've read your brief for "${project.title}" and can deliver the full outcome within ${periodDays} days, including revisions. We'd love to walk you through our approach — when suits a quick chat? (Template mode — set ANTHROPIC_API_KEY for tailored proposals.)`,
    };
  }

  const raw = await complete(
    `${DRYVN_VOICE}

You are DRYVN's Bid agent. Write a winning Freelancer.com bid proposal.
Rules:
- Open with a line that proves we actually read THEIR brief (reference a specific detail).
- 3 short paragraphs max, no bullet-point walls, no generic filler.
- State a concrete deliverable and timeline.
- End with one engaging question to start a conversation.
- Never mention being an AI, an agency of agents, or outsourcing.
Respond with ONLY JSON: {"amount": number, "periodDays": number, "proposal": "text"}.
Amount must be within the client's budget band; price high in the band only
when the proposal justifies the value.`,
    `PROJECT
Title: ${project.title}
Budget: $${project.budgetMin}–$${project.budgetMax}
Skills: ${project.skills}
Estimated delivery: ${project.estimatedDays ?? "unknown"} days
Description:
${project.description.slice(0, 3000)}`,
    900
  );

  try {
    const parsed = JSON.parse(raw.replace(/```json?|```/g, "").trim());
    const amount = Number(parsed.amount);
    return {
      amount: isFinite(amount) && amount > 0 ? Math.min(amount, project.budgetMax) : anchor,
      periodDays: Math.max(1, Number(parsed.periodDays) || periodDays),
      proposal: String(parsed.proposal ?? "").trim(),
    };
  } catch {
    return { amount: anchor, periodDays, proposal: raw.trim() };
  }
}
