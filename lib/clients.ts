// Saved clients. A client is matched by name (case and surrounding spaces ignored), so "Alex Chen"
// and "Northwind Legal" are separate clients even when they share a billing email. Saving an invoice
// saves its Bill to details here, so the next invoice can pick the client instead of retyping.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { ApiError } from "./errors";
import type { Client } from "./types";

type Row = Record<string, unknown>;

const emailRe = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
export const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export interface BillTo {
  name: string;
  company: string;
  email: string;
  cc: string[];
  address: string;
}

/** First use: build the list from the invoices already in the database (latest details win). */
function ensureSeeded() {
  const d = db();
  if (d.prepare("SELECT 1 FROM settings WHERE key = 'clients_seeded'").get()) return;
  d.transaction(() => {
    if (d.prepare("SELECT 1 FROM settings WHERE key = 'clients_seeded'").get()) return;
    const rows = d
      .prepare(
        `SELECT client_name, client_company, client_email, client_cc, client_address FROM invoices
         WHERE trim(client_name) != '' ORDER BY created_at, rowid`,
      )
      .all() as Row[];
    for (const r of rows)
      upsertRow({
        name: r.client_name as string,
        company: r.client_company as string,
        email: r.client_email as string,
        cc: JSON.parse((r.client_cc as string) || "[]"),
        address: r.client_address as string,
      });
    d.prepare("INSERT INTO settings(key, value) VALUES('clients_seeded', 'true') ON CONFLICT(key) DO NOTHING").run();
  }).immediate();
}

function toClient(r: Row): Client {
  return {
    id: r.id as string,
    name: r.name as string,
    company: r.company as string,
    email: r.email as string,
    cc: JSON.parse((r.cc as string) || "[]"),
    address: r.address as string,
    invoice_count: (r.invoice_count as number) ?? 0,
    last_invoiced: (r.last_invoiced as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

const SELECT = `SELECT c.*,
  (SELECT count(*) FROM invoices i WHERE lower(trim(i.client_name)) = c.name_key) AS invoice_count,
  (SELECT max(i.issue_date) FROM invoices i WHERE lower(trim(i.client_name)) = c.name_key) AS last_invoiced
  FROM clients c`;

export function listClients(): Client[] {
  ensureSeeded();
  return (db().prepare(`${SELECT} ORDER BY c.name COLLATE NOCASE`).all() as Row[]).map(toClient);
}

export function clientById(id: string): Client | null {
  ensureSeeded();
  const r = db().prepare(`${SELECT} WHERE c.id = ?`).get(id) as Row | undefined;
  return r ? toClient(r) : null;
}

export function requireClient(id: string): Client {
  const c = clientById(id);
  if (!c) throw new ApiError(404, `Client ${id} not found`);
  return c;
}

/** Insert, or update the client with the same name: each non-empty field replaces the saved one. */
function upsertRow(b: BillTo): void {
  const name = b.name.trim().replace(/\s+/g, " ");
  if (!name) return;
  const key = nameKey(name);
  const now = new Date().toISOString();
  const cur = db().prepare("SELECT * FROM clients WHERE name_key = ?").get(key) as Row | undefined;
  const cc = (b.cc ?? []).filter(Boolean);
  if (!cur) {
    db()
      .prepare(
        `INSERT INTO clients (id, name, name_key, company, email, cc, address, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), name, key, b.company.trim(), b.email.trim(), JSON.stringify(cc), b.address.trim(), now, now);
    return;
  }
  db()
    .prepare(`UPDATE clients SET name = ?, company = ?, email = ?, cc = ?, address = ?, updated_at = ? WHERE id = ?`)
    .run(
      name,
      b.company.trim() || (cur.company as string),
      b.email.trim() || (cur.email as string),
      cc.length ? JSON.stringify(cc) : (cur.cc as string),
      b.address.trim() || (cur.address as string),
      now,
      cur.id,
    );
}

/** Called whenever an invoice is saved. */
export function upsertClientFromInvoice(b: BillTo): void {
  if (!b.name?.trim()) return;
  ensureSeeded();
  upsertRow(b);
}

// ---------- explicit create / edit / delete (Clients page and API) ----------

const clientSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  company: z.string().trim().max(200).optional(),
  email: z.string().trim().max(200).optional(),
  cc: z.union([z.array(z.string()), z.string()]).optional(),
  address: z.string().max(1000).optional(),
});

export function parseClientInput(body: unknown): BillTo {
  const r = clientSchema.safeParse(body);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    throw new ApiError(400, `Invalid client: ${msg}`);
  }
  const d = r.data;
  const cc = (Array.isArray(d.cc) ? d.cc : (d.cc ?? "").split(/[,;\s]+/)).map((x) => x.trim()).filter(Boolean);
  const bad = [d.email, ...cc].filter((e) => e && !emailRe.test(e));
  if (bad.length) throw new ApiError(400, `Invalid email address: ${bad.join(", ")}`);
  return { name: d.name.replace(/\s+/g, " "), company: d.company ?? "", email: d.email ?? "", cc, address: (d.address ?? "").trim() };
}

function assertNameFree(name: string, exceptId?: string) {
  const other = db().prepare("SELECT id FROM clients WHERE name_key = ?").get(nameKey(name)) as Row | undefined;
  if (other && other.id !== exceptId) throw new ApiError(409, `A client named "${name}" already exists.`);
}

export function createClient(b: BillTo): Client {
  ensureSeeded();
  assertNameFree(b.name);
  const id = randomUUID();
  const now = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO clients (id, name, name_key, company, email, cc, address, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, b.name, nameKey(b.name), b.company, b.email, JSON.stringify(b.cc), b.address, now, now);
  return requireClient(id);
}

/** Sets every field exactly as given (an empty field clears it). Past invoices keep what they were sent with. */
export function updateClient(id: string, b: BillTo): Client {
  requireClient(id);
  assertNameFree(b.name, id);
  db()
    .prepare(
      `UPDATE clients SET name = ?, name_key = ?, company = ?, email = ?, cc = ?, address = ?, updated_at = ? WHERE id = ?`,
    )
    .run(b.name, nameKey(b.name), b.company, b.email, JSON.stringify(b.cc), b.address, new Date().toISOString(), id);
  return requireClient(id);
}

/** Removes the saved client only; invoices already made for them are not touched. */
export function deleteClient(id: string): void {
  requireClient(id);
  db().prepare("DELETE FROM clients WHERE id = ?").run(id);
}
