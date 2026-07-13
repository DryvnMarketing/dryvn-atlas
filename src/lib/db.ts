import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = process.env.ATLAS_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "atlas.db");

let db: Database.Database | null = null;

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
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external ON messages(externalId) WHERE externalId IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_external ON threads(externalThreadId) WHERE externalThreadId IS NOT NULL;
  `);

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
