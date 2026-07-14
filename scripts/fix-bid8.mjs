// One-time repair: replace the JSON-corrupted proposal on bid 8 with the
// human-written version, and salvage bid 23's inner proposal text.
import Database from "better-sqlite3";

const db = new Database("data/atlas.db");

const human = `Hi — had a proper look at v3.swcgaming.com before bidding. It's a dark casino-style listing layout with grid content cards and a specific header/body font pairing. Very doable to clone 1:1. The fiddly part is the spacing and hover states — that's usually where "close enough" clones fall apart, and we won't cut that corner.

Day 1 we get the site installed and running on your VPS (database, files, dependencies). Then we rebuild the UI section by section against the reference until it matches, drop in your branding and copy changes, and finish with responsive QA on desktop and mobile. You get the live site, source files and all credentials within 4 days.

So we can start fast: do you have your logo, colours and copy ready, or will those follow once the core clone is up?`;

db.prepare("UPDATE bids SET proposal = ?, amount = 650, periodDays = 4 WHERE id = 8").run(human);

// Bid 23: extract the inner proposal string from the stored JSON blob.
const b23 = db.prepare("SELECT proposal FROM bids WHERE id = 23").get();
const m = b23.proposal.match(/"proposal"\s*:\s*"([\s\S]*)"\s*}?\s*$/);
if (m) {
  const inner = m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
  const amt = b23.proposal.match(/"amount"\s*:\s*(\d+)/);
  const days = b23.proposal.match(/"periodDays"\s*:\s*(\d+)/);
  db.prepare("UPDATE bids SET proposal = ?, amount = COALESCE(?, amount), periodDays = COALESCE(?, periodDays) WHERE id = 23")
    .run(inner, amt ? Number(amt[1]) : null, days ? Number(days[1]) : null);
  console.log("bid 23 salvaged");
} else {
  db.prepare("UPDATE bids SET status = 'rejected' WHERE id = 23").run();
  console.log("bid 23 unsalvageable — rejected so it can never be placed");
}
console.log("bid 8 replaced with human version ($650 / 4d)");
