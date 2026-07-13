import { complete, isLive as claudeLive, DRYVN_VOICE } from "./claude";

/**
 * Comms agent: drafts replies in client threads in DRYVN's studio voice.
 * Escalation rule: pricing, scope, deadlines, refunds, complaints and
 * off-platform requests are flagged for the human instead of auto-committed.
 */
export interface ReplyDraft {
  body: string;
  escalate: boolean;
  escalateReason: string | null;
}

const ESCALATE_PATTERN =
  /price|budget|discount|cheaper|refund|cancel|deadline|scope|complain|dispute|legal|paypal|whatsapp|telegram|outside|direct payment/i;

export async function draftReply(context: {
  projectTitle: string;
  history: { direction: "inbound" | "outbound"; body: string }[];
}): Promise<ReplyDraft> {
  const lastInbound = [...context.history].reverse().find((m) => m.direction === "inbound");

  if (!claudeLive()) {
    return {
      body: `Thanks for your message! We're reviewing the details and will come back to you shortly with specifics.\n\n— DRYVN Studio`,
      escalate: ESCALATE_PATTERN.test(lastInbound?.body ?? ""),
      escalateReason: "Heuristic keyword match (template mode)",
    };
  }

  const raw = await complete(
    `${DRYVN_VOICE}

You are DRYVN's Comms agent replying inside a Freelancer.com project chat on
behalf of DRYVN Studio.

VOICE RULES (brand-critical):
- Write as "we" — the studio. Warm, specific, professional, forward-moving.
- Sign off with "— DRYVN Studio".
- Never claim to be a specific human typing in the moment. If the client asks
  directly whether they are talking to a bot or AI, answer honestly: DRYVN
  uses AI assistance for fast responses, and every project decision and all
  delivered work is overseen by Shaun, DRYVN's founder. Say it confidently —
  fast, consistent communication is a feature, not a secret.
- Never promise anything unscoped, never invent capabilities or past work,
  never overcommit on timelines.

MILESTONES (educate when the client seems unsure how payment works):
- Explain simply: on the project page they click "Create Milestone", choose
  the amount, and fund it. Freelancer holds the funds securely — nothing is
  released to us until they review the work and release it themselves. It
  protects both sides.
- Work begins once the first milestone is FUNDED (not released). If a client
  wants work to start without one, warmly explain this is standard practice
  that protects them just as much as us.

ESCALATION — set escalate=true (the human decides) for:
- price changes or discount requests
- scope changes or additions
- firm deadline commitments or changes
- refunds, complaints, disputes, anything legal
- requests to pay or communicate outside Freelancer (also gently note that
  keeping everything on-platform is a Freelancer rule that protects them)
When escalating, the drafted reply should hold ground warmly — acknowledge,
say we'll confirm and come right back — without agreeing to anything.

Respond ONLY with JSON:
{"body": "the reply text", "escalate": true|false, "escalateReason": "one short sentence or null"}`,
    `Project: ${context.projectTitle}

Conversation (oldest first):
${context.history.map((m) => `${m.direction === "inbound" ? "CLIENT" : "DRYVN"}: ${m.body}`).join("\n").slice(0, 5000)}`,
    800
  );

  try {
    const parsed = JSON.parse(raw.replace(/```json?|```/g, "").trim());
    return {
      body: String(parsed.body ?? "").trim(),
      escalate: !!parsed.escalate,
      escalateReason: parsed.escalateReason ? String(parsed.escalateReason) : null,
    };
  } catch {
    return {
      body: raw.trim(),
      escalate: true,
      escalateReason: "Could not parse agent output — review manually",
    };
  }
}
