import { complete, isLive as claudeLive, DRYVN_VOICE } from "./claude";
import { DEFAULT_SCRIPT_INSTRUCTIONS } from "../db";
import { clampProposal } from "../pricing";
import type { FreelancerProject, PortfolioItem } from "../types";

export interface BidDraft {
  amount: number;
  periodDays: number;
  proposal: string;
}

export interface DraftOptions {
  /** Instructions + target length from the chosen script. Falls back to Atlas's default rules. */
  script?: { instructions: string; wordCount: number };
  /** Price decided upstream (pricing %, rank pricing). When set the writer must not suggest another. */
  priceOverride?: number;
  /** Days (fixed projects) or weekly hours (hourly projects) decided upstream. */
  periodOverride?: number;
  /** User-entered past work that matches this project; the only work the writer may mention. */
  portfolio?: PortfolioItem[];
}

type DraftProject = Pick<
  FreelancerProject,
  "title" | "description" | "budgetMin" | "budgetMax" | "skills" | "estimatedDays"
> & { projectType?: "fixed" | "hourly"; currency?: string };

/**
 * Bid agent: writes a proposal by running the project through a script (a named
 * set of writing instructions). Pricing is normally decided before this runs, so
 * the proposal text and the submitted amount always agree.
 */
export async function draftBid(project: DraftProject, opts: DraftOptions = {}): Promise<BidDraft> {
  const hourly = project.projectType === "hourly";
  const anchor = opts.priceOverride ?? Math.round(project.budgetMax * 0.92);
  const periodDays =
    opts.periodOverride ?? (hourly ? 10 : Math.max(2, Math.ceil((project.estimatedDays ?? 4) * 1.4))); // buffer for quality
  const script = opts.script ?? { instructions: DEFAULT_SCRIPT_INSTRUCTIONS, wordCount: 120 };
  const cur = project.currency ?? "USD";

  if (!claudeLive()) {
    return {
      amount: anchor,
      periodDays,
      proposal: clampProposal(
        `Hi! DRYVN here. We build ${JSON.parse(project.skills || "[]").slice(0, 2).join(" and ") || "digital products"} end-to-end, in-house. We've read your brief for "${project.title}" and can deliver the full outcome within ${periodDays} days, including revisions. We'd love to walk you through our approach. When suits a quick chat? (Template mode: set ANTHROPIC_API_KEY for tailored proposals.)`
      ),
    };
  }

  const portfolioBlock = opts.portfolio?.length
    ? `\nRELEVANT PAST WORK (the ONLY past work you may mention. Weave in at most one item, in one short natural sentence. Never invent other work, clients, results or links):\n${opts.portfolio
        .map((p) => `- ${p.title}${p.description ? `: ${p.description}` : ""}`)
        .join("\n")}\n`
    : "";

  const priceBlock =
    opts.priceOverride !== undefined
      ? `Our price is fixed at ${opts.priceOverride} ${cur}${hourly ? " per hour" : ""}. It is already set by our pricing strategy. Do not suggest a different number anywhere in the proposal or the JSON. Use exactly ${opts.priceOverride} for "amount", and do not reference milestone amounts or totals that imply a different price.`
      : `"amount" must be within the client's budget band. Price high in the band only when the proposal justifies the value.`;

  const raw = await complete(
    `${DRYVN_VOICE}

You are DRYVN's Bid agent. Write a Freelancer.com bid proposal by following this script exactly:

--- SCRIPT ---
${script.instructions}
--- END SCRIPT ---

LENGTH: about ${script.wordCount} words, and never more than 1400 characters in total (Freelancer rejects longer proposals).
${hourly ? `This is an HOURLY project: talk about our rate and weekly availability, never a project total. Our weekly limit on this bid is ${periodDays} hours, so if you mention availability use exactly that.\n` : ""}${portfolioBlock}
Respond with ONLY JSON: {"amount": number, "periodDays": number, "proposal": "text"}.
The proposal value must be a single valid JSON string (escape newlines as \\n).
${priceBlock}`,
    `PROJECT
Title: ${project.title}
Type: ${hourly ? "hourly" : "fixed price"}
Budget: ${project.budgetMin}–${project.budgetMax} ${cur}
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
      amount: opts.priceOverride ?? (isFinite(amount) && amount > 0 ? Math.min(amount, project.budgetMax) : anchor),
      periodDays: opts.periodOverride ?? Math.max(1, Number(parsed.periodDays) || periodDays),
      proposal: clampProposal(String(parsed.proposal ?? "")),
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
      amount: opts.priceOverride ?? (amountMatch ? Math.min(Number(amountMatch[1]), project.budgetMax) : anchor),
      periodDays: opts.periodOverride ?? (daysMatch ? Number(daysMatch[1]) : periodDays),
      proposal: clampProposal(
        salvaged ||
          `We've read your brief for "${project.title}" and can deliver the full scope within ${periodDays} days, including revisions. Happy to walk you through our approach. When suits a quick chat?`
      ),
    };
  }
}
