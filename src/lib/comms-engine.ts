import { getDb, logActivity } from "./db";
import { getSettings } from "./governor";
import { draftReply } from "./agents/comms";
import * as freelancer from "./freelancer";

export interface CommsRunResult {
  threadsSynced: number;
  messagesSynced: number;
  drafted: number;
  autoSent: number;
  escalated: number;
  mode: "live" | "demo";
}

/**
 * One comms cycle:
 * 1. Sync Freelancer threads + messages into the local DB (dedup by external id)
 * 2. For every thread whose latest message is from the client and has no
 *    pending reply yet, draft a response.
 * 3. autoReply ON + not escalated  → send immediately via the API.
 *    Otherwise                     → queue as pending_approval in Chats.
 */
export async function runCommsCycle(): Promise<CommsRunResult> {
  const db = getDb();
  const s = getSettings();
  const result: CommsRunResult = {
    threadsSynced: 0, messagesSynced: 0, drafted: 0, autoSent: 0, escalated: 0,
    mode: freelancer.isLive() ? "live" : "demo",
  };

  // Phase 1: sync threads + messages from Freelancer (live only)
  if (freelancer.isLive()) await syncThreads(result);

  // Phase 2: draft replies for any local thread awaiting one
  await draftPass(result, s.autoReply);

  // Only log when something actually happened — keeps the feed clean under
  // 5-minute auto-polling.
  if (result.messagesSynced > 0 || result.drafted > 0) {
    logActivity("comms", "cycle_complete", `${result.threadsSynced} threads, ${result.messagesSynced} new messages, ${result.drafted} drafts (${result.autoSent} auto-sent, ${result.escalated} escalated)`);
  }
  return result;
}

async function syncThreads(result: CommsRunResult) {
  const db = getDb();
  const ourId = Number(process.env.FREELANCER_USER_ID ?? 0);
  const { threads, users } = await freelancer.getThreads();

  for (const ft of threads) {
    if (!ft?.id) continue;

    // Match the thread to a known project via its context; stub otherwise.
    let project = ft.context?.type === "project" && ft.context.id
      ? (db.prepare("SELECT id, title FROM projects WHERE externalId = ?").get(ft.context.id) as { id: number; title: string } | undefined)
      : undefined;
    if (!project) {
      const stubTitle = ft.context?.id ? `Freelancer project #${ft.context.id}` : "Direct conversation";
      const existing = db.prepare("SELECT id, title FROM projects WHERE title = ? AND budgetMax = 0").get(stubTitle) as { id: number; title: string } | undefined;
      project = existing ?? (() => {
        const info = db.prepare(
          `INSERT INTO projects (externalId, title, description, postedAt, url, status)
           VALUES (?, ?, 'Synced from Freelancer messages', datetime('now'), 'https://www.freelancer.com/messages', 'closed')`
        ).run(ft.context?.id ?? null, stubTitle);
        return { id: Number(info.lastInsertRowid), title: stubTitle };
      })();
    }

    const clientMember = (ft.members ?? []).find((m) => m !== ourId);
    const clientName =
      (clientMember && (users[String(clientMember)]?.display_name || users[String(clientMember)]?.username)) || "Client";

    // Upsert thread
    let threadRow = db.prepare("SELECT id FROM threads WHERE externalThreadId = ?").get(ft.id) as { id: number } | undefined;
    if (!threadRow) {
      const info = db.prepare(
        "INSERT INTO threads (projectId, externalThreadId, clientName) VALUES (?, ?, ?)"
      ).run(project.id, ft.id, clientName);
      threadRow = { id: Number(info.lastInsertRowid) };
    } else {
      db.prepare("UPDATE threads SET clientName = ? WHERE id = ?").run(clientName, threadRow.id);
    }
    result.threadsSynced++;

    // Sync messages
    const msgs = await freelancer.getThreadMessages(ft.id);
    const insertMsg = db.prepare(
      `INSERT OR IGNORE INTO messages (threadId, direction, body, status, sentAt, externalId)
       VALUES (?, ?, ?, ?, datetime(?, 'unixepoch'), ?)`
    );
    for (const m of msgs) {
      const direction = m.from_user === ourId ? "outbound" : "inbound";
      const r = insertMsg.run(threadRow.id, direction, m.message ?? "", direction === "inbound" ? "received" : "sent", m.time_created, m.id);
      if (r.changes > 0) result.messagesSynced++;
    }
    if (msgs.length) {
      db.prepare("UPDATE threads SET lastMessageAt = datetime(?, 'unixepoch') WHERE id = ?")
        .run(msgs[msgs.length - 1].time_created, threadRow.id);
    }
  }
}

async function draftPass(result: CommsRunResult, autoReply: boolean) {
  const db = getDb();
  const threads = db.prepare(
    `SELECT t.id, t.externalThreadId, t.clientName, p.title AS projectTitle,
            p.budgetMax AS projectBudgetMax
     FROM threads t JOIN projects p ON p.id = t.projectId`
  ).all() as { id: number; externalThreadId: number | null; clientName: string; projectTitle: string; projectBudgetMax: number }[];

  for (const t of threads) {
    try {
      await handleThread(t, result, autoReply);
    } catch (err) {
      logActivity("comms", "thread_error", `${t.clientName} on "${t.projectTitle}": ${String(err).slice(0, 200)}`);
    }
  }
}

async function handleThread(
  t: { id: number; externalThreadId: number | null; clientName: string; projectTitle: string; projectBudgetMax: number },
  result: CommsRunResult,
  autoReply: boolean
) {
  const db = getDb();
  {
    const history = db.prepare(
      "SELECT direction, body, status FROM messages WHERE threadId = ? AND status != 'discarded' ORDER BY sentAt ASC, id ASC"
    ).all(t.id) as { direction: "inbound" | "outbound"; body: string; status: string }[];
    if (!history.length) return;
    const last = history[history.length - 1];
    const hasPendingDraft = history.some((m) => m.status === "pending_approval");
    if (last.direction !== "inbound" || hasPendingDraft) return;

    const draft = await draftReply({
      projectTitle: t.projectTitle,
      history: history.filter((m) => m.status !== "pending_approval").map((m) => ({ direction: m.direction, body: m.body })),
    });
    result.drafted++;

    // Auto-send only in real project conversations — support/system threads
    // (stub projects, budgetMax 0) always queue for human review.
    const canAutoSend =
      autoReply && !draft.escalate && freelancer.isLive() && t.externalThreadId && t.projectBudgetMax > 0;
    let autoSendFailed: string | null = null;
    if (canAutoSend) {
      try {
        await freelancer.sendMessage(t.externalThreadId!, draft.body);
        db.prepare(
          "INSERT INTO messages (threadId, direction, body, status) VALUES (?, 'outbound', ?, 'sent')"
        ).run(t.id, draft.body);
        result.autoSent++;
        logActivity("comms", "auto_replied", `Auto-reply sent to ${t.clientName} on "${t.projectTitle}"`);
      } catch (err) {
        // Thread may be closed or restricted — keep the draft, keep the cycle alive.
        autoSendFailed = String(err).slice(0, 200);
        logActivity("comms", "send_failed", `${t.clientName} on "${t.projectTitle}": ${autoSendFailed}`);
      }
    }
    if (!canAutoSend || autoSendFailed) {
      db.prepare(
        "INSERT INTO messages (threadId, direction, body, status, escalateReason) VALUES (?, 'outbound', ?, 'pending_approval', ?)"
      ).run(t.id, draft.body, autoSendFailed ? `Auto-send failed (thread may be closed): ${autoSendFailed}` : draft.escalateReason);
      if (draft.escalate) {
        result.escalated++;
        logActivity("comms", "escalated", `${t.clientName} on "${t.projectTitle}": ${draft.escalateReason ?? "needs your decision"}`);
      } else {
        logActivity("comms", "reply_drafted", `Draft queued for ${t.clientName} on "${t.projectTitle}"`);
      }
    }
  }
}
