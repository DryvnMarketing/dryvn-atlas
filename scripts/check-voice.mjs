// Report pending proposals that slip into first-person singular.
import Database from "better-sqlite3";

const db = new Database("data/atlas.db");
const rows = db.prepare(
  "SELECT b.id, p.title, b.proposal FROM bids b JOIN projects p ON p.id = b.projectId WHERE b.status = 'pending_approval'"
).all();

const singular = /\b(I|I'll|I'd|I've|me|my)\b/;
for (const r of rows) {
  const sentences = r.proposal.split(/(?<=[.?!])\s+/).filter((s) => singular.test(s));
  if (sentences.length) {
    console.log(`bid ${r.id} | ${r.title.slice(0, 45)}`);
    for (const s of sentences.slice(0, 3)) console.log("   >> " + s.trim());
  }
}
console.log("done");
