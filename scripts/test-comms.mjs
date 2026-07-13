// Local test: inject a fake client thread + inbound message. The next engine
// run will draft a reply for it (thread has no externalThreadId, so nothing
// can ever be sent to Freelancer — it stays local).
// Cleanup: node scripts/test-comms.mjs --cleanup
import Database from "better-sqlite3";
import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const db = new Database(process.env.ATLAS_DATA_DIR + "/atlas.db");

if (process.argv.includes("--cleanup")) {
  const p = db.prepare("SELECT id FROM projects WHERE externalId = 111000111").get();
  if (p) {
    db.prepare("DELETE FROM messages WHERE threadId IN (SELECT id FROM threads WHERE projectId = ?)").run(p.id);
    db.prepare("DELETE FROM threads WHERE projectId = ?").run(p.id);
    db.prepare("DELETE FROM projects WHERE id = ?").run(p.id);
  }
  console.log("test data cleaned up");
  process.exit(0);
}

db.prepare(
  `INSERT OR IGNORE INTO projects (externalId, title, description, budgetMin, budgetMax, postedAt, url, status)
   VALUES (111000111, '[TEST] Bakery website with online ordering', 'test', 300, 600, datetime('now'), '', 'awarded')`
).run();
const proj = db.prepare("SELECT id FROM projects WHERE externalId = 111000111").get();
db.prepare("INSERT INTO threads (projectId, externalThreadId, clientName) VALUES (?, NULL, 'TestClient Maria')").run(proj.id);
const thread = db.prepare("SELECT id FROM threads WHERE projectId = ?").get(proj.id);
db.prepare(
  "INSERT INTO messages (threadId, direction, body, status) VALUES (?, 'inbound', ?, 'received')"
).run(
  thread.id,
  "Hi, I awarded you the project! Two questions: 1) I've never used this site before, how do I actually pay you? 2) Could you also add a blog section? I know we agreed $450 but maybe you can include it for the same price?"
);
console.log("Seeded test thread — run an engine cycle, then check the Chats page.");
