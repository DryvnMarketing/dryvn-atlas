import { complete, isLive as claudeLive, DRYVN_VOICE } from "./claude";
import type { FreelancerProject } from "../types";

export interface FitAssessment {
  fitScore: number; // 0-100
  fitReason: string;
  estimatedDays: number;
}

/**
 * Scout agent: scores how well a discovered project fits DRYVN's skills and
 * quality bar, and estimates delivery time (feeds the capacity governor).
 */
export interface ScoutContext {
  bidMin: number;
  bidMax: number;
  buildingReviews: boolean; // true while we deliberately chase small jobs for ratings
}

export async function assessFit(
  project: Pick<FreelancerProject, "title" | "description" | "budgetMin" | "budgetMax" | "skills">,
  ourSkills: string[],
  ctx: ScoutContext = { bidMin: 40, bidMax: 300, buildingReviews: true }
): Promise<FitAssessment> {
  if (!claudeLive()) return heuristicFit(project, ourSkills);

  const strategy = ctx.buildingReviews
    ? `CURRENT STRATEGY — building reviews: DRYVN is deliberately targeting SMALL,
quick jobs in the $${ctx.bidMin}–$${ctx.bidMax} range to earn 5-star reviews and
ratings fast. A LOW BUDGET IS NOT A RED FLAG right now — a small, well-scoped
job we can deliver cleanly in 1–3 days is exactly what we want and should score
HIGH (75–95). Judge SCOPE-vs-BUDGET REALISM, not the absolute number:
- Small budget + small, clear task (a logo, one landing page, a WordPress fix,
  a few graphics) = GREAT fit, score high.
- Small budget + huge ask (a full custom SaaS, a multi-page app, "Uber clone"
  for $80) = genuine mismatch, score low.
Reserve low scores for: scope that clearly can't be delivered for the money,
vague/confusing briefs, ratings risk (abusive-sounding clients), or work
outside our skills entirely (data entry, article writing, SEO backlinks,
lead lists, virtual assistant).`
    : `Judge skill match, scope clarity, and whether the budget is realistic for
the scope. Below 50 means skip.`;

  const raw = await complete(
    `${DRYVN_VOICE}

You are DRYVN's Scout agent. Assess whether this Freelancer.com project is a
good fit. Respond with ONLY a JSON object: {"fitScore": 0-100, "fitReason":
"one sentence", "estimatedDays": number}.

${strategy}`,
    `Our services: ${ourSkills.join(", ")}

Our proof points (score higher where these give us an evidenced edge, lower
where we'd be stretching): we design AND build in-house; we run our own SaaS
products (Dryvn Pulse — fleet/parts operations, Brandflow — AI social media);
we built a fully custom 6-module ERP; strong dashboard/admin-panel and
dark-UI work; logo + brand identity systems; industrial-sector experience
(construction equipment, hydraulics); React/Next.js/Node/TypeScript stack;
Shopify and WordPress when they fit.

PROJECT
Title: ${project.title}
Budget: $${project.budgetMin}–$${project.budgetMax}
Required skills: ${project.skills}
Description:
${project.description.slice(0, 3000)}`,
    300
  );

  try {
    const parsed = JSON.parse(raw.replace(/```json?|```/g, "").trim());
    return {
      fitScore: Math.max(0, Math.min(100, Number(parsed.fitScore) || 0)),
      fitReason: String(parsed.fitReason ?? ""),
      estimatedDays: Math.max(0.5, Number(parsed.estimatedDays) || 3),
    };
  } catch {
    return heuristicFit(project, ourSkills);
  }
}

function heuristicFit(
  project: Pick<FreelancerProject, "title" | "description" | "budgetMin" | "budgetMax" | "skills">,
  ourSkills: string[]
): FitAssessment {
  const text = `${project.title} ${project.description} ${project.skills}`.toLowerCase();
  const keywords = ourSkills.flatMap((s) => s.toLowerCase().split(/[^a-z]+/)).filter((w) => w.length > 3);
  const hits = new Set(keywords.filter((k) => text.includes(k)));
  const score = Math.min(95, 30 + hits.size * 12);
  return {
    fitScore: score,
    fitReason: `Keyword match on ${hits.size} service terms (heuristic mode — set ANTHROPIC_API_KEY for full assessment)`,
    estimatedDays: project.budgetMax <= 300 ? 2 : 4,
  };
}
