import { business, getSettings } from "./settings";
import { ApiError, appendSend, patchRaw, requireInvoice } from "./invoices";
import { LOGO_CID, deliver, transportReady } from "./email";
import { invoicePdf } from "./pdf-service";
import { emailSubject, renderInvoiceEmail } from "./email-html";
import { createPaymentLink, deactivatePaymentLink, markPaidRow, stripeConfigured, syncInvoiceFromStripe } from "./stripe";
import type { Invoice, PaidMethod } from "./types";
import { formatMoneyGhl, todayISO } from "./types";

const emailRe = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export function renderFor(inv: Invoice, logoSrc: string) {
  return renderInvoiceEmail({
    invoice: inv,
    business: business(),
    logoSrc,
    payUrl: inv.payment.card ? inv.stripe.url : null,
  });
}

export function previewHtml(id: string): string {
  return renderFor(requireInvoice(id), "/api/logo").html;
}

function normalizeList(v: unknown, field: string): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  const arr = Array.isArray(v) ? v : String(v).split(/[,;\s]+/);
  const out = arr.map((x) => String(x).trim()).filter(Boolean);
  const bad = out.filter((e) => !emailRe.test(e));
  if (bad.length) throw new ApiError(400, `Invalid email address in ${field}: ${bad.join(", ")}`);
  return out;
}

export async function sendInvoice(id: string, opts: { to?: unknown; cc?: unknown } = {}): Promise<Invoice> {
  const inv = requireInvoice(id);
  if (inv.status === "paid") throw new ApiError(409, `Invoice ${inv.number} is already paid.`);
  if (inv.status === "void") throw new ApiError(409, `Invoice ${inv.number} is void. Duplicate it to send a new one.`);

  const to = normalizeList(opts.to, "to") ?? (inv.bill_to.email ? [inv.bill_to.email] : []);
  const cc = normalizeList(opts.cc, "cc") ?? inv.bill_to.cc;
  if (!to.length) throw new ApiError(400, "No recipient: set the client email (or pass `to`) before sending.");
  if (!inv.bill_to.name.trim()) throw new ApiError(400, "Client name is required before sending.");
  const lines = inv.items.filter((i) => i.description.trim());
  if (!lines.length) throw new ApiError(400, "Add at least one line item with a description before sending.");
  if (inv.total_cents <= 0) throw new ApiError(400, "Invoice total must be greater than zero.");
  if (!inv.payment.etransfer && !inv.payment.card)
    throw new ApiError(400, "Turn on at least one payment option (e-Transfer or card).");
  if (inv.payment.etransfer) {
    const b = business();
    if (!b.etransfer_email && !b.etransfer_text)
      throw new ApiError(400, "e-Transfer is on but no e-Transfer details are set in Settings.");
  }
  const ready = transportReady();
  if (!ready.ok) throw new ApiError(400, ready.reason ?? "Email is not set up.");

  let cur = inv;
  if (inv.payment.card) {
    if (!stripeConfigured())
      throw new ApiError(400, "Card payment is on but Stripe is not configured. Add a key in Settings or turn off card.");
    if (!inv.stripe.url || !inv.stripe.active) {
      try {
        const link = await createPaymentLink(inv);
        patchRaw(inv.id, {
          stripe_price_id: link.priceId,
          stripe_link_id: link.id,
          stripe_link_url: link.url,
          stripe_link_active: 1,
        });
        cur = requireInvoice(inv.id);
      } catch (e) {
        throw new ApiError(502, e instanceof Error ? e.message : String(e));
      }
    }
  }

  const { html, text } = renderFor(cur, `cid:${LOGO_CID}`);
  let res;
  try {
    const pdf = await invoicePdf(cur.id);
    res = await deliver({
      pdf: { filename: `${pdf.number}.pdf`, content: pdf.buf },
      to,
      cc,
      subject: emailSubject(cur, business()),
      html,
      text,
      label: cur.number,
    });
  } catch (e) {
    throw new ApiError(502, e instanceof Error ? e.message : String(e));
  }
  const now = new Date().toISOString();
  appendSend(cur.id, { to, cc, message_id: res.message_id, transport: res.transport, sent_at: now });
  patchRaw(cur.id, { status: "sent", sent_at: cur.sent_at ?? now });
  return requireInvoice(cur.id);
}

export async function markPaid(
  id: string,
  opts: { method?: unknown; date?: unknown; note?: unknown },
): Promise<Invoice> {
  const inv = requireInvoice(id);
  if (inv.status === "void") throw new ApiError(409, `Invoice ${inv.number} is void.`);
  if (inv.status === "paid") throw new ApiError(409, `Invoice ${inv.number} is already paid.`);
  if (inv.status === "draft") throw new ApiError(409, `Invoice ${inv.number} has not been sent yet.`);
  const method = String(opts.method ?? "");
  if (!["etransfer", "card", "eft", "other"].includes(method))
    throw new ApiError(400, "method must be one of: etransfer, card, eft, other");
  const date = opts.date ? String(opts.date) : todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "date must be YYYY-MM-DD");
  markPaidRow(id, method as PaidMethod, date, opts.note ? String(opts.note).slice(0, 500) : "");
  // Stop the client paying twice; best effort.
  try {
    await deactivatePaymentLink({ ...inv, stripe: { ...inv.stripe, active: inv.stripe.active } });
  } catch {
    /* the invoice is paid either way */
  }
  return requireInvoice(id);
}

/** Records money given back on a paid invoice. Refunds add up; they cannot exceed the total. */
export function recordRefund(id: string, opts: { amount_cents?: unknown; date?: unknown; note?: unknown }): Invoice {
  const inv = requireInvoice(id);
  if (inv.status !== "paid") throw new ApiError(409, `Invoice ${inv.number} is ${inv.status}; only paid invoices can be refunded.`);
  const amount = Number(opts.amount_cents);
  if (!Number.isInteger(amount) || amount <= 0)
    throw new ApiError(400, "amount_cents must be a whole number of cents greater than zero");
  const already = inv.refund?.cents ?? 0;
  const left = inv.total_cents - already;
  if (amount > left)
    throw new ApiError(400, `Refund is more than what is left to refund (${formatMoneyGhl(left, inv.currency)}).`);
  const date = opts.date ? String(opts.date) : todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "date must be YYYY-MM-DD");
  const note = opts.note ? String(opts.note).slice(0, 500) : "";
  patchRaw(id, {
    refunded_cents: already + amount,
    refunded_at: date,
    refund_note: [inv.refund?.note, note].filter(Boolean).join("; "),
  });
  return requireInvoice(id);
}

export async function voidInvoice(id: string): Promise<{ invoice: Invoice; warning?: string }> {
  const inv = requireInvoice(id);
  if (inv.status === "void") throw new ApiError(409, `Invoice ${inv.number} is already void.`);
  if (inv.status === "paid") throw new ApiError(409, `Invoice ${inv.number} is paid and cannot be voided.`);
  let warning: string | undefined;
  try {
    await deactivatePaymentLink(inv);
  } catch (e) {
    warning = `${e instanceof Error ? e.message : e} Deactivate the link in the Stripe dashboard.`;
  }
  patchRaw(id, { status: "void", voided_at: new Date().toISOString() });
  return { invoice: requireInvoice(id), warning };
}

export async function syncInvoice(id: string): Promise<{ invoice: Invoice; paid: boolean; note: string }> {
  const inv = requireInvoice(id);
  if (!stripeConfigured()) return { invoice: inv, paid: false, note: "Stripe is not configured; nothing to sync." };
  if (inv.status !== "sent") return { invoice: inv, paid: false, note: `Invoice is ${inv.status}; only sent invoices are synced.` };
  if (!inv.stripe.link_id) return { invoice: inv, paid: false, note: "This invoice has no Stripe payment link." };
  try {
    const r = await syncInvoiceFromStripe(id);
    return { invoice: requireInvoice(id), paid: r.paid, note: r.paid ? "Payment found; marked paid (card)." : "No completed card payment yet." };
  } catch (e) {
    throw new ApiError(502, `Stripe sync failed: ${e instanceof Error ? e.message : e}`);
  }
}

export async function sendTestEmail(): Promise<string> {
  const s = getSettings();
  const ready = transportReady();
  if (!ready.ok) throw new Error(ready.reason);
  const to = s.google_email || s.email;
  if (!to) throw new Error("No address to send the test to. Set a business email in Settings.");
  const demo = createDemoInvoice();
  const { html, text } = renderFor(demo, `cid:${LOGO_CID}`);
  const r = await deliver({
    to: [to],
    cc: [],
    subject: `[Test] ${emailSubject(demo, business())}`,
    html,
    text,
    label: "test-email",
  });
  return `Test email sent to ${to} (${r.transport === "file" ? "written to data/outbox" : "Gmail id " + r.message_id}).`;
}

function createDemoInvoice(): Invoice {
  const today = todayISO();
  const items = [{ description: "Sample line item", quantity: 1, unit_price_cents: 10000 }];
  return {
    id: "demo",
    number: "TEST-0000",
    status: "draft",
    display_status: "draft",
    currency: "CAD",
    issue_date: today,
    due_date: today,
    bill_to: { name: "Test Recipient", company: "", email: "", cc: [], address: "" },
    items,
    tax: null,
    subtotal_cents: 10000,
    tax_cents: 0,
    total_cents: 10000,
    notes: "This is a test email from your invoicing app.",
    message: "This is a test email. No invoice was created.",
    payment: { etransfer: true, card: false },
    stripe: { link_id: null, url: null, active: false },
    paid: null,
    refund: null,
    sent_at: null,
    voided_at: null,
    sends: [],
    created_at: "",
    updated_at: "",
  };
}
