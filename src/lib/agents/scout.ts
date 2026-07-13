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
export async function assessFit(
  project: Pick<FreelancerProject, "title" | "description" | "budgetMin" | "budgetMax" | "skills">,
  ourSkills: string[]
): Promise<FitAssessment> {
  if (!claudeLive()) return heuristicFit(project, ourSkills);

  const raw = await complete(
    `${DRYVN_VOICE}

You are DRYVN's Scout agent. Assess whether this Freelancer.com project is a
good fit. Respond with ONLY a JSON object: {"fitScore": 0-100, "fitReason":
"one sentence", "estimatedDays": number}. Score harshly: below 50 means skip.
Consider: skill match, scope clarity, budget sanity for the ask, red flags
(vague scope, unrealistic expectations, ratings risk).`,
    `Our services: ${ourSkills.join(", ")}

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
