// One-time cleanup: remove demo-mode sample projects now that live keys exist,
// so a demo bid can never be approved into a real Freelancer bid.
import Database from "better-sqlite3";

const db = new Database("data/atlas.db");
const demo = db
  .prepare(
    "SELECT id FROM projects WHERE (externalId BETWEEN 900001 AND 900005) OR url LIKE '%/demo-%'"
  )
  .all()
  .map((r) => r.id);

if (demo.length) {
  const ph = demo.map(() => "?").join(",");
  db.prepare(
    `DELETE FROM messages WHERE threadId IN (SELECT id FROM threads WHERE projectId IN (${ph}))`
  ).run(...demo);
  db.prepare(`DELETE FROM threads WHERE projectId IN (${ph})`).run(...demo);
  db.prepare(`DELETE FROM bids WHERE projectId IN (${ph})`).run(...demo);
  db.prepare(`DELETE FROM projects WHERE id IN (${ph})`).run(...demo);
}
console.log("purged demo projects:", demo.length);
console.log(
  "remaining pending bids:",
  db.prepare("SELECT COUNT(*) c FROM bids WHERE status='pending_approval'").get().c
);
