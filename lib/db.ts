import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

const g = globalThis as unknown as { __db?: Database.Database };

function open(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "invoices.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      currency TEXT NOT NULL DEFAULT 'CAD',
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      client_name TEXT NOT NULL DEFAULT '',
      client_company TEXT NOT NULL DEFAULT '',
      client_email TEXT NOT NULL DEFAULT '',
      client_cc TEXT NOT NULL DEFAULT '[]',
      client_address TEXT NOT NULL DEFAULT '',
      items TEXT NOT NULL DEFAULT '[]',
      tax_name TEXT,
      tax_rate REAL,
      subtotal_cents INTEGER NOT NULL DEFAULT 0,
      tax_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      pay_etransfer INTEGER NOT NULL DEFAULT 1,
      pay_card INTEGER NOT NULL DEFAULT 0,
      stripe_price_id TEXT,
      stripe_link_id TEXT,
      stripe_link_url TEXT,
      stripe_link_active INTEGER NOT NULL DEFAULT 0,
      paid_at TEXT,
      paid_method TEXT,
      paid_note TEXT,
      sent_at TEXT,
      voided_at TEXT,
      sends TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS invoices_status ON invoices(status);
  `);
  // Columns added after the first release.
  const cols = new Set((db.prepare("PRAGMA table_info(invoices)").all() as { name: string }[]).map((c) => c.name));
  const add: Record<string, string> = {
    refunded_cents: "INTEGER NOT NULL DEFAULT 0",
    refunded_at: "TEXT",
    refund_note: "TEXT",
  };
  for (const [name, type] of Object.entries(add)) {
    if (!cols.has(name)) db.exec(`ALTER TABLE invoices ADD COLUMN ${name} ${type}`);
  }
  return db;
}

export function db(): Database.Database {
  if (!g.__db) g.__db = open();
  return g.__db;
}
