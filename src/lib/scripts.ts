import { getDb } from "./db";
import type { Script, ScriptStats } from "./types";

type ScriptRow = Omit<Script, "isDefault" | "archived"> & { isDefault: number; archived: number };

const toScript = (r: ScriptRow): Script => ({ ...r, isDefault: !!r.isDefault, archived: !!r.archived });

/** Scripts with live stats. Stats are derived from the bids table, never stored, so they can't drift. */
export function listScripts(includeArchived = false): ScriptStats[] {
  const rows = getDb().prepare(
    `SELECT s.*,
        (SELECT COUNT(*) FROM bids b WHERE b.scriptId = s.id AND b.status IN ('placed','won','lost')) AS sends,
        (SELECT COUNT(*) FROM bids b WHERE b.scriptId = s.id AND b.repliedAt IS NOT NULL) AS replies,
        (SELECT MAX(b.placedAt) FROM bids b WHERE b.scriptId = s.id AND b.placedAt IS NOT NULL) AS lastUsed
     FROM scripts s
     ${includeArchived ? "" : "WHERE s.archived = 0"}
     ORDER BY s.isDefault DESC, s.createdAt ASC`
  ).all() as (ScriptRow & { sends: number; replies: number; lastUsed: string | null })[];
  return rows.map((r) => ({
    ...toScript(r),
    sends: r.sends,
    replies: r.replies,
    replyRate: r.sends ? Math.round((r.replies / r.sends) * 1000) / 10 : 0,
    lastUsed: r.lastUsed,
  }));
}

export function getScript(id: number): Script | null {
  const r = getDb().prepare("SELECT * FROM scripts WHERE id = ?").get(id) as ScriptRow | undefined;
  return r ? toScript(r) : null;
}

export function getDefaultScript(): Script {
  const db = getDb();
  const r = (db.prepare("SELECT * FROM scripts WHERE isDefault = 1 AND archived = 0 LIMIT 1").get() ??
    db.prepare("SELECT * FROM scripts WHERE archived = 0 ORDER BY id LIMIT 1").get()) as ScriptRow;
  return toScript(r);
}

/**
 * Script for an automated bid. With A/B testing on, the active script with the
 * fewest sends goes next (round-robin that self-balances); otherwise the default.
 */
export function pickScript(abTest: boolean): Script {
  if (!abTest) return getDefaultScript();
  const active = listScripts(false);
  if (active.length <= 1) return getDefaultScript();
  const next = [...active].sort((a, b) => a.sends - b.sends || a.id - b.id)[0];
  return getScript(next.id) ?? getDefaultScript();
}

export function saveScript(input: { id?: number; title: string; instructions: string; wordCount: number; isDefault?: boolean }): Script {
  const db = getDb();
  const wc = Math.min(400, Math.max(30, Math.round(input.wordCount) || 120));
  let id = input.id;
  if (id) {
    db.prepare("UPDATE scripts SET title = ?, instructions = ?, wordCount = ? WHERE id = ?")
      .run(input.title.trim(), input.instructions, wc, id);
  } else {
    id = Number(db.prepare("INSERT INTO scripts (title, instructions, wordCount) VALUES (?, ?, ?)")
      .run(input.title.trim(), input.instructions, wc).lastInsertRowid);
  }
  if (input.isDefault) setDefaultScript(id);
  return getScript(id)!;
}

export function setDefaultScript(id: number) {
  const db = getDb();
  db.prepare("UPDATE scripts SET isDefault = 0").run();
  db.prepare("UPDATE scripts SET isDefault = 1, archived = 0 WHERE id = ?").run(id);
}

/** Scripts that have been used are archived (so history stays intact); unused ones are deleted. */
export function removeScript(id: number): "deleted" | "archived" | "blocked" {
  const db = getDb();
  const s = getScript(id);
  if (!s) return "blocked";
  if (s.isDefault) return "blocked"; // pick another default first
  const used = (db.prepare("SELECT COUNT(*) AS n FROM bids WHERE scriptId = ?").get(id) as { n: number }).n;
  if (used) {
    db.prepare("UPDATE scripts SET archived = 1 WHERE id = ?").run(id);
    return "archived";
  }
  db.prepare("DELETE FROM scripts WHERE id = ?").run(id);
  return "deleted";
}
