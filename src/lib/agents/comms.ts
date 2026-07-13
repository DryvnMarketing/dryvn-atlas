import { complete, isLive as claudeLive, DRYVN_VOICE } from "./claude";

/**
 * Comms agent: drafts replies in client threads. Escalation rule: anything
 * touching price changes, scope changes, refunds, or deadline commitments is
 * flagged for the user instead of auto-drafted confidently.
 */
export interface ReplyDraft {
  body: string;
  escalate: boolean;
  escalateReason: string | null;
}

export async function draftReply(context: {
  projectTitle: string;
  history: { direction: "inbound" | "outbound"; body: string }[];
}): Promise<ReplyDraft> {
  const lastInbound = [...context.history].reverse().find((m) => m.direction === "inbound");

  if (!claudeLive()) {
    return {
      body: `Thanks for your message! We're on it and will come back to you shortly with specifics. (Template mode — set ANTHROPIC_API_KEY for tailored replies.)`,
      escalate: /price|budget|refund|deadline|cancel|scope/i.test(lastInbound?.body ?? ""),
      escalateReason: "Heuristic keyword match on pricing/scope terms",
    };
  }

  const raw = await complete(
    `${DRYVN_VOICE}

You are DRYVN's Comms agent replying inside a Freelancer.com project chat.
Respond with ONLY JSON:
{"body": "the reply", "escalate": boolean, "escalateReason": "why or null"}.
Set escalate=true when the client raises price changes, scope changes,
refunds, complaints, or firm deadline commitments — the human decides those.
Keep replies short, specific, and forward-moving.`,
    `Project: ${context.projectTitle}

Conversation (oldest first):
${context.history.map((m) => `${m.direction === "inbound" ? "CLIENT" : "DRYVN"}: ${m.body}`).join("\n").slice(0, 4000)}`,
    700
  );

  try {
    const parsed = JSON.parse(raw.replace(/```json?|```/g, "").trim());
    return {
      body: String(parsed.body ?? "").trim(),
      escalate: !!parsed.escalate,
      escalateReason: parsed.escalateReason ? String(parsed.escalateReason) : null,
    };
  } catch {
    return { body: raw.trim(), escalate: true, escalateReason: "Could not parse agent output — review manually" };
  }
}
