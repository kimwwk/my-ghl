import Stripe from "stripe";
import { getInvoice, patchRaw, listInvoices } from "./invoices";
import { stripeKey } from "./settings";
import { formatMoney, todayISO, type Invoice, type PaidMethod } from "./types";

export function stripeConfigured(): boolean {
  return !!stripeKey();
}

export function stripeMode(key = stripeKey()): "test" | "live" | null {
  if (/^(sk|rk)_test_/.test(key)) return "test";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  return null;
}

export function client(key = stripeKey()): Stripe {
  if (!key) throw new Error("Stripe is not configured. Add a secret key in Settings > Stripe.");
  return new Stripe(key, { maxNetworkRetries: 1, timeout: 20000 });
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function testStripe(key?: string): Promise<string> {
  const k = (key || stripeKey()).trim();
  const mode = stripeMode(k);
  if (!k) throw new Error("No Stripe secret key set.");
  if (!mode) throw new Error("That does not look like a Stripe secret key (expected sk_test_... or sk_live_...).");
  try {
    // Listing payment links exercises the permission the app actually needs.
    await client(k).paymentLinks.list({ limit: 1 });
  } catch (e) {
    throw new Error(`Stripe rejected the key: ${msg(e)}`);
  }
  return `Connected to Stripe in ${mode} mode.`;
}

/** Creates a Price (inline product) and a single-use Payment Link for the invoice. */
export async function createPaymentLink(inv: Invoice): Promise<{ id: string; url: string; priceId: string }> {
  if (inv.total_cents < 50) throw new Error("Card payments need a total of at least 0.50.");
  const stripe = client();
  try {
    const price = await stripe.prices.create({
      currency: inv.currency.toLowerCase(),
      unit_amount: inv.total_cents,
      product_data: { name: `Invoice ${inv.number}` },
    });
    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      restrictions: { completed_sessions: { limit: 1 } },
      metadata: { invoice_id: inv.id, invoice_number: inv.number },
      after_completion: {
        type: "hosted_confirmation",
        hosted_confirmation: {
          custom_message: `Thank you. Payment received for invoice ${inv.number} (${formatMoney(inv.total_cents, inv.currency)}).`,
        },
      },
    });
    return { id: link.id, url: link.url, priceId: price.id };
  } catch (e) {
    throw new Error(`Stripe could not create the payment link: ${msg(e)}`);
  }
}

export async function deactivatePaymentLink(inv: Invoice): Promise<void> {
  if (!inv.stripe.link_id || !inv.stripe.active || !stripeConfigured()) return;
  try {
    await client().paymentLinks.update(inv.stripe.link_id, { active: false });
    patchRaw(inv.id, { stripe_link_active: 0 });
  } catch (e) {
    throw new Error(`Could not deactivate the Stripe payment link: ${msg(e)}`);
  }
}

export function markPaidRow(id: string, method: PaidMethod, at: string, note: string) {
  patchRaw(id, { status: "paid", paid_at: at, paid_method: method, paid_note: note, stripe_link_active: 0 });
}

/** Checks one sent invoice's Payment Link for a paid Checkout Session. */
export async function syncInvoiceFromStripe(id: string): Promise<{ paid: boolean }> {
  const inv = getInvoice(id);
  if (!inv || inv.status !== "sent" || !inv.stripe.link_id) return { paid: false };
  const sessions = await client().checkout.sessions.list({ payment_link: inv.stripe.link_id, limit: 10 });
  const done = sessions.data.find((s) => s.status === "complete" && s.payment_status === "paid");
  if (!done) return { paid: false };
  markPaidRow(inv.id, "card", todayISO(), `Stripe Checkout Session ${done.id}`);
  return { paid: true };
}

let lastAuto = 0;
/** Throttled sync of every sent invoice that has a Stripe link. Never throws. */
export async function autoSyncSent(minIntervalMs = 60_000): Promise<number> {
  if (!stripeConfigured() || Date.now() - lastAuto < minIntervalMs) return 0;
  lastAuto = Date.now();
  let n = 0;
  for (const inv of listInvoices("sent").concat(listInvoices("overdue"))) {
    if (!inv.stripe.link_id) continue;
    try {
      if ((await syncInvoiceFromStripe(inv.id)).paid) n++;
    } catch {
      /* ignore: surfaced by explicit Sync */
    }
  }
  return n;
}

export function handleCheckoutCompleted(session: Stripe.Checkout.Session): string | null {
  if (session.payment_status !== "paid") return null;
  let inv: Invoice | null = null;
  const metaId = session.metadata?.invoice_id;
  if (metaId) inv = getInvoice(metaId);
  if (!inv && typeof session.payment_link === "string") {
    inv = listInvoices().find((i) => i.stripe.link_id === session.payment_link) ?? null;
  }
  if (!inv || inv.status === "paid" || inv.status === "void") return inv?.number ?? null;
  markPaidRow(inv.id, "card", todayISO(), `Stripe Checkout Session ${session.id}`);
  return inv.number;
}
