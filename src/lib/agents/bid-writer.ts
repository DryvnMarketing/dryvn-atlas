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
- 3 short paragraphs max, 90-150 words total, no bullet-point walls, no generic filler.
- State a concrete deliverable and timeline.
- End with one practical question to start a conversation.
- Never mention being an AI, an agency of agents, or outsourcing.

WRITE LIKE A BUSY PROFESSIONAL TYPING, NOT LIKE MARKETING COPY:
- ALWAYS first-person plural: "we", "we'll", "our". NEVER "I", "I'll", "me", "my" —
  DRYVN is a studio and speaks as one in every sentence.
- Contractions always (we'll, it's, don't). Vary sentence length; short ones are good.
- At most ONE em-dash in the whole proposal. No semicolons.
- Never open by flattering their thinking ("You've clearly...", "...is exactly the
  right instinct"). Just get into the work.
- Banned words/phrases: seamless(ly), leverage, robust, elevate, craft(ed),
  tailored, delve, streamline, "bring to life", "exactly the kind of", "we enjoy",
  "from day one", "nail down".
- Plain verbs over fancy ones: build, fix, match, ship, hand over.
- It should read like it took 4 minutes to type, with one small imperfection of
  rhythm, not like a polished pitch.

Respond with ONLY JSON: {"amount": number, "periodDays": number, "proposal": "text"}.
The proposal value must be a single valid JSON string (escape newlines as \\n).
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

  const cleaned = raw.replace(/```json?|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    const amount = Number(parsed.amount);
    return {
      amount: isFinite(amount) && amount > 0 ? Math.min(amount, project.budgetMax) : anchor,
      periodDays: Math.max(1, Number(parsed.periodDays) || periodDays),
      proposal: String(parsed.proposal ?? "").trim(),
    };
  } catch {
    // Malformed JSON (usually unescaped newlines inside the proposal string).
    // Salvage the fields rather than ever storing raw JSON as the proposal.
    const amountMatch = cleaned.match(/"amount"\s*:\s*(\d+(?:\.\d+)?)/);
    const daysMatch = cleaned.match(/"periodDays"\s*:\s*(\d+)/);
    const propMatch = cleaned.match(/"proposal"\s*:\s*"([\s\S]*)"\s*}?\s*$/);
    const salvaged = propMatch
      ? propMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim()
      : cleaned.startsWith("{")
        ? "" // never show a client raw JSON — template fallback below
        : cleaned;
    return {
      amount: amountMatch ? Math.min(Number(amountMatch[1]), project.budgetMax) : anchor,
      periodDays: daysMatch ? Number(daysMatch[1]) : periodDays,
      proposal:
        salvaged ||
        `We've read your brief for "${project.title}" and can deliver the full scope within ${periodDays} days, including revisions. Happy to walk you through our approach — when suits a quick chat?`,
    };
  }
}
