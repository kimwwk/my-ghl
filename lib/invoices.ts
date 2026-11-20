import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { getSettings, saveSettings, stripeKey } from "./settings";
import {
  type DisplayStatus,
  type Invoice,
  type PaidMethod,
  type SendLogEntry,
  type Status,
  addDaysISO,
  computeTotals,
  padNumber,
  todayISO,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Row = Record<string, unknown>;

function toInvoice(r: Row): Invoice {
  const status = r.status as Status;
  const due = r.due_date as string;
  const refunded = (r.refunded_cents as number) || 0;
  const total = r.total_cents as number;
  let display: DisplayStatus = status;
  if (status === "sent" && due < todayISO()) display = "overdue";
  if (status === "paid" && refunded > 0) display = refunded >= total ? "refunded" : "part_refunded";
  const tax =
    r.tax_name !== null && r.tax_rate !== null
      ? { name: r.tax_name as string, rate_percent: r.tax_rate as number }
      : null;
  return {
    id: r.id as string,
    number: r.number as string,
    status,
    display_status: display,
    currency: r.currency as Invoice["currency"],
    issue_date: r.issue_date as string,
    due_date: due,
    bill_to: {
      name: r.client_name as string,
      company: r.client_company as string,
      email: r.client_email as string,
      cc: JSON.parse(r.client_cc as string),
      address: r.client_address as string,
    },
    items: JSON.parse(r.items as string),
    tax,
    subtotal_cents: r.subtotal_cents as number,
    tax_cents: r.tax_cents as number,
    total_cents: r.total_cents as number,
    notes: r.notes as string,
    message: r.message as string,
    payment: { etransfer: !!r.pay_etransfer, card: !!r.pay_card },
    stripe: {
      link_id: (r.stripe_link_id as string) ?? null,
      url: (r.stripe_link_url as string) ?? null,
      active: !!r.stripe_link_active,
    },
    paid: r.paid_at
      ? { at: r.paid_at as string, method: r.paid_method as PaidMethod, note: (r.paid_note as string) ?? "" }
      : null,
    refund:
      refunded > 0
        ? { cents: refunded, at: (r.refunded_at as string) ?? null, note: (r.refund_note as string) ?? "" }
        : null,
    sent_at: (r.sent_at as string) ?? null,
    voided_at: (r.voided_at as string) ?? null,
    sends: JSON.parse(r.sends as string),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

export function getInvoice(id: string): Invoice | null {
  const r = db().prepare("SELECT * FROM invoices WHERE id = ?").get(id) as Row | undefined;
  return r ? toInvoice(r) : null;
}

export function requireInvoice(id: string): Invoice {
  const inv = getInvoice(id);
  if (!inv) throw new ApiError(404, `Invoice ${id} not found`);
  return inv;
}

export function listInvoices(status?: string): Invoice[] {
  const rows = db().prepare("SELECT * FROM invoices ORDER BY created_at DESC, rowid DESC").all() as Row[];
  let list = rows.map(toInvoice);
  if (status && status !== "all") {
    if (!["draft", "sent", "paid", "void", "overdue", "refunded"].includes(status)) {
      throw new ApiError(400, `Unknown status "${status}". Use draft, sent, paid, void, overdue or refunded.`);
    }
    list = list.filter((i) => matchesFilter(i, status));
  }
  return list;
}

/** List filter: "refunded" covers full and partial refunds; the rest match display_status. */
export function matchesFilter(i: Invoice, f: string): boolean {
  if (f === "all") return true;
  if (f === "refunded") return i.display_status === "refunded" || i.display_status === "part_refunded";
  return i.display_status === f;
}

export function nextInvoiceNumber(): string {
  const s = getSettings();
  let n = s.next_number;
  let num = padNumber(s.invoice_prefix, n);
  const exists = db().prepare("SELECT 1 FROM invoices WHERE number = ?");
  while (exists.get(num)) {
    n++;
    num = padNumber(s.invoice_prefix, n);
  }
  return num;
}

/** After saving number "INV-0007", make sure next_number is at least 8. */
function bumpNextNumber(number: string) {
  const s = getSettings();
  if (!number.startsWith(s.invoice_prefix)) return;
  const tail = number.slice(s.invoice_prefix.length);
  if (!/^\d+$/.test(tail)) return;
  const n = parseInt(tail, 10);
  if (n >= s.next_number) saveSettings({ next_number: n + 1 });
}

// ---------- validation ----------

const emailRe = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

const itemSchema = z.object({
  description: z.string().max(2000),
  quantity: z.number().finite().min(0, "quantity must be >= 0"),
  unit_price_cents: z.number().int("unit_price_cents must be an integer number of cents"),
});

export const invoiceInputSchema = z.object({
  number: z.string().trim().min(1).max(40).optional(),
  currency: z.enum(["CAD", "USD"]).optional(),
  issue_date: isoDate.optional(),
  due_date: isoDate.optional(),
  bill_to: z
    .object({
      name: z.string().trim().max(200).optional(),
      company: z.string().trim().max(200).optional(),
      email: z.string().trim().max(200).optional(),
      cc: z.array(z.string().trim()).max(20).optional(),
      address: z.string().max(1000).optional(),
    })
    .optional(),
  items: z.array(itemSchema).max(100).optional(),
  tax: z
    .object({ name: z.string().trim().max(60), rate_percent: z.number().finite().min(0).max(100) })
    .nullable()
    .optional(),
  notes: z.string().max(5000).optional(),
  message: z.string().max(5000).optional(),
  payment: z.object({ etransfer: z.boolean().optional(), card: z.boolean().optional() }).optional(),
});
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

export function parseInvoiceInput(body: unknown): InvoiceInput {
  const r = invoiceInputSchema.safeParse(body);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    throw new ApiError(400, `Invalid invoice: ${msg}`);
  }
  const d = r.data;
  const bad = [d.bill_to?.email, ...(d.bill_to?.cc ?? [])].filter((e) => e && !emailRe.test(e));
  if (bad.length) throw new ApiError(400, `Invalid email address: ${bad.join(", ")}`);
  if (d.issue_date && d.due_date && d.due_date < d.issue_date)
    throw new ApiError(400, "due_date cannot be before issue_date");
  return d;
}

// ---------- create / update ----------

export function createInvoice(input: InvoiceInput): Invoice {
  const s = getSettings();
  const number = input.number?.trim() || nextInvoiceNumber();
  if (db().prepare("SELECT 1 FROM invoices WHERE number = ?").get(number))
    throw new ApiError(409, `Invoice number ${number} is already used`);
  const issue = input.issue_date ?? todayISO();
  const due = input.due_date ?? addDaysISO(issue, s.terms_days);
  const items = input.items ?? [];
  const tax =
    input.tax !== undefined
      ? input.tax
      : s.default_tax_enabled
        ? { name: s.default_tax_name, rate_percent: s.default_tax_rate }
        : null;
  const t = computeTotals(items, tax);
  const hasStripe = !!stripeKey(s);
  const payEt = input.payment?.etransfer ?? !!(s.etransfer_email || s.etransfer_text);
  const payCard = input.payment?.card ?? hasStripe;
  const now = new Date().toISOString();
  const id = randomUUID();
  const b = input.bill_to ?? {};
  db()
    .prepare(
      `INSERT INTO invoices (id, number, status, currency, issue_date, due_date, client_name, client_company,
        client_email, client_cc, client_address, items, tax_name, tax_rate, subtotal_cents, tax_cents, total_cents,
        notes, message, pay_etransfer, pay_card, created_at, updated_at)
       VALUES (@id, @number, 'draft', @currency, @issue, @due, @cn, @cc, @ce, @ccc, @ca, @items, @tn, @tr, @sub, @tax,
        @total, @notes, @message, @pe, @pc, @now, @now)`,
    )
    .run({
      id,
      number,
      currency: input.currency ?? s.default_currency,
      issue,
      due,
      cn: b.name ?? "",
      cc: b.company ?? "",
      ce: b.email ?? "",
      ccc: JSON.stringify(b.cc ?? []),
      ca: b.address ?? "",
      items: JSON.stringify(items),
      tn: tax ? tax.name : null,
      tr: tax ? tax.rate_percent : null,
      sub: t.subtotal_cents,
      tax: t.tax_cents,
      total: t.total_cents,
      notes: input.notes ?? s.default_notes,
      message: input.message ?? "",
      pe: payEt ? 1 : 0,
      pc: payCard ? 1 : 0,
      now,
    });
  bumpNextNumber(number);
  return requireInvoice(id);
}

export function updateInvoice(id: string, input: InvoiceInput): Invoice {
  const cur = requireInvoice(id);
  if (cur.status !== "draft")
    throw new ApiError(409, `Invoice ${cur.number} is ${cur.status} and locked. Void it and duplicate to change it.`);
  const number = input.number?.trim() || cur.number;
  if (number !== cur.number && db().prepare("SELECT 1 FROM invoices WHERE number = ? AND id != ?").get(number, id))
    throw new ApiError(409, `Invoice number ${number} is already used`);
  const b = { ...cur.bill_to, ...(input.bill_to ?? {}) } as Invoice["bill_to"];
  const items = input.items ?? cur.items;
  const tax = input.tax !== undefined ? input.tax : cur.tax;
  const t = computeTotals(items, tax);
  const issue = input.issue_date ?? cur.issue_date;
  const due = input.due_date ?? cur.due_date;
  if (due < issue) throw new ApiError(400, "due_date cannot be before issue_date");
  db()
    .prepare(
      `UPDATE invoices SET number=@number, currency=@currency, issue_date=@issue, due_date=@due, client_name=@cn,
        client_company=@cc, client_email=@ce, client_cc=@ccc, client_address=@ca, items=@items, tax_name=@tn,
        tax_rate=@tr, subtotal_cents=@sub, tax_cents=@tax, total_cents=@total, notes=@notes, message=@message,
        pay_etransfer=@pe, pay_card=@pc, updated_at=@now WHERE id=@id`,
    )
    .run({
      id,
      number,
      currency: input.currency ?? cur.currency,
      issue,
      due,
      cn: b.name ?? "",
      cc: b.company ?? "",
      ce: b.email ?? "",
      ccc: JSON.stringify(b.cc ?? []),
      ca: b.address ?? "",
      items: JSON.stringify(items),
      tn: tax ? tax.name : null,
      tr: tax ? tax.rate_percent : null,
      sub: t.subtotal_cents,
      tax: t.tax_cents,
      total: t.total_cents,
      notes: input.notes ?? cur.notes,
      message: input.message ?? cur.message,
      pe: (input.payment?.etransfer ?? cur.payment.etransfer) ? 1 : 0,
      pc: (input.payment?.card ?? cur.payment.card) ? 1 : 0,
      now: new Date().toISOString(),
    });
  bumpNextNumber(number);
  return requireInvoice(id);
}

export function deleteDraft(id: string) {
  const cur = requireInvoice(id);
  if (cur.status !== "draft") throw new ApiError(409, "Only drafts can be deleted. Void sent invoices instead.");
  db().prepare("DELETE FROM invoices WHERE id = ?").run(id);
}

export function duplicateInvoice(id: string): Invoice {
  const cur = requireInvoice(id);
  return createInvoice({
    currency: cur.currency,
    bill_to: { ...cur.bill_to },
    items: cur.items,
    tax: cur.tax,
    notes: cur.notes,
    message: cur.message,
    payment: { ...cur.payment },
  });
}

// ---------- state transitions (used by the service layer) ----------

export function patchRaw(id: string, cols: Record<string, string | number | null>) {
  const keys = Object.keys(cols);
  const set = keys.map((k) => `${k} = @${k}`).join(", ");
  db()
    .prepare(`UPDATE invoices SET ${set}, updated_at = @__now WHERE id = @__id`)
    .run({ ...cols, __now: new Date().toISOString(), __id: id });
}

export function appendSend(id: string, entry: SendLogEntry) {
  const cur = requireInvoice(id);
  patchRaw(id, { sends: JSON.stringify([...cur.sends, entry]) });
}
