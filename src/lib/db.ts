import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = process.env.ATLAS_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "atlas.db");

let db: Database.Database | null = null;

// The bid-writing rules Atlas has always used, now stored as an editable script.
export const DEFAULT_SCRIPT_INSTRUCTIONS = `Write a winning Freelancer.com bid proposal.
- Open with a line that proves we actually read THEIR brief (reference a specific detail).
- Short paragraphs, no bullet-point walls, no generic filler.
- State a concrete deliverable and timeline.
- End with one practical question to start a conversation.
- Never mention being an AI, an agency of agents, or outsourcing.

WRITE LIKE A BUSY PROFESSIONAL TYPING, NOT LIKE MARKETING COPY:
- ALWAYS first-person plural: "we", "we'll", "our". NEVER "I", "I'll", "me", "my".
  DRYVN is a studio and speaks as one in every sentence.
- Contractions always (we'll, it's, don't). Vary sentence length; short ones are good.
- At most ONE em-dash in the whole proposal. No semicolons.
- Never open by flattering their thinking ("You've clearly...", "...is exactly the right instinct"). Just get into the work.
- Banned words/phrases: seamless(ly), leverage, robust, elevate, craft(ed), tailored, delve, streamline, "bring to life", "exactly the kind of", "we enjoy", "from day one", "nail down".
- Plain verbs over fancy ones: build, fix, match, ship, hand over.
- It should read like it took 4 minutes to type, with one small imperfection of rhythm, not like a polished pitch.`;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      externalId INTEGER UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      budgetMin REAL NOT NULL DEFAULT 0,
      budgetMax REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      skills TEXT NOT NULL DEFAULT '[]',
      postedAt TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      fitScore REAL,
      fitReason TEXT,
      estimatedDays REAL,
      status TEXT NOT NULL DEFAULT 'discovered',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL REFERENCES projects(id),
      amount REAL NOT NULL,
      periodDays INTEGER NOT NULL DEFAULT 7,
      proposal TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      placedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL REFERENCES projects(id),
      externalThreadId INTEGER,
      clientName TEXT NOT NULL DEFAULT '',
      lastMessageAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      threadId INTEGER NOT NULL REFERENCES threads(id),
      direction TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      sentAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      bidMinUsd REAL NOT NULL,
      bidMaxUsd REAL NOT NULL,
      maxConcurrentProjects INTEGER NOT NULL,
      smallProjectMinUsd REAL NOT NULL,
      smallProjectMaxUsd REAL NOT NULL,
      smallProjectCap INTEGER NOT NULL,
      smallProjectWindowDays INTEGER NOT NULL,
      autoBid INTEGER NOT NULL DEFAULT 0,
      autoReply INTEGER NOT NULL DEFAULT 0,
      skills TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL DEFAULT (datetime('now')),
      agent TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT ''
    );
  `);

  // Post-v1 migrations (idempotent)
  try { db.exec("ALTER TABLE messages ADD COLUMN externalId INTEGER"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE messages ADD COLUMN escalateReason TEXT"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE threads ADD COLUMN closed INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external ON messages(externalId) WHERE externalId IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_external ON threads(externalThreadId) WHERE externalThreadId IS NOT NULL;
  `);

  // v3: scripts (named bid-writing instruction sets), portfolio matching, period
  // rules and live-feed project metadata.
  db.exec(`
    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL,
      wordCount INTEGER NOT NULL DEFAULT 120,
      isDefault INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      skills TEXT NOT NULL DEFAULT '[]',
      link TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Bid period by price: first rule whose [lowerUsd, upperUsd] contains the bid wins.
    CREATE TABLE IF NOT EXISTS period_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lowerUsd REAL NOT NULL,
      upperUsd REAL NOT NULL,
      days INTEGER NOT NULL
    );
  `);
  for (const stmt of [
    "ALTER TABLE bids ADD COLUMN scriptId INTEGER",
    "ALTER TABLE bids ADD COLUMN repliedAt TEXT",
    "ALTER TABLE projects ADD COLUMN projectType TEXT NOT NULL DEFAULT 'fixed'",
    "ALTER TABLE projects ADD COLUMN exchangeRate REAL NOT NULL DEFAULT 1",
    "ALTER TABLE projects ADD COLUMN bidCount INTEGER",
    "ALTER TABLE projects ADD COLUMN bidAvg REAL",
    "ALTER TABLE projects ADD COLUMN language TEXT NOT NULL DEFAULT 'en'",
    "ALTER TABLE projects ADD COLUMN flags TEXT NOT NULL DEFAULT '{}'",
    "ALTER TABLE settings ADD COLUMN pricePct REAL NOT NULL DEFAULT 92",
    "ALTER TABLE settings ADD COLUMN minFixedUsd REAL NOT NULL DEFAULT 0",
    "ALTER TABLE settings ADD COLUMN minHourlyUsd REAL NOT NULL DEFAULT 0",
    "ALTER TABLE settings ADD COLUMN attachPortfolio INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE settings ADD COLUMN abTestScripts INTEGER NOT NULL DEFAULT 0",
  ]) {
    try { db.exec(stmt); } catch { /* column exists */ }
  }

  // Seed the default script once, from the voice rules Atlas has always used.
  if (!db.prepare("SELECT id FROM scripts LIMIT 1").get()) {
    db.prepare(
      "INSERT INTO scripts (title, instructions, wordCount, isDefault) VALUES (?, ?, ?, 1)"
    ).run("Atlas Default", DEFAULT_SCRIPT_INSTRUCTIONS, 120);
  }

  // Seed default settings (user-specified guardrails) once
  const row = db.prepare("SELECT id FROM settings WHERE id = 1").get();
  if (!row) {
    db.prepare(
      `INSERT INTO settings
        (id, bidMinUsd, bidMaxUsd, maxConcurrentProjects,
         smallProjectMinUsd, smallProjectMaxUsd, smallProjectCap,
         smallProjectWindowDays, autoBid, autoReply, skills)
       VALUES (1, 150, 600, 3, 200, 300, 5, 5, 0, 0, ?)`
    ).run(
      JSON.stringify([
        "Website Development",
        "Web Applications",
        "SaaS Development",
        "Landing Pages",
        "Graphic Design",
        "Logo Design",
        "Brand Identity",
        "Dashboards & Admin Panels",
        "API Integration",
      ])
    );
  }
}

export function logActivity(agent: string, action: string, detail = "") {
  getDb()
    .prepare("INSERT INTO activity (agent, action, detail) VALUES (?, ?, ?)")
    .run(agent, action, detail);
}
