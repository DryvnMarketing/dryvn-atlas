import Anthropic from "@anthropic-ai/sdk";

// Shared Claude client for all Atlas agents.
// Set ANTHROPIC_API_KEY in .env.local. Without it, agents fall back to
// deterministic templates so the pipeline still works in demo mode.

export function isLive(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;

export function getClaude(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export const AGENT_MODEL = process.env.ATLAS_AGENT_MODEL ?? "claude-sonnet-5";

export async function complete(system: string, user: string, maxTokens = 1500): Promise<string> {
  const res = await getClaude().messages.create({
    model: AGENT_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}

export const DRYVN_VOICE = `You write on behalf of DRYVN, a South African digital studio delivering
websites, web apps, SaaS platforms, dashboards, and brand/graphic design.
DRYVN's reputation and Freelancer.com ratings are priority #1: never promise
what can't be delivered, never inflate experience, always be specific and
professional. Tone: confident, warm, concise — a senior studio, not a
desperate freelancer. All work is delivered in-house by DRYVN (never
outsourced). Price the OUTCOME and its business value, not hours.`;
