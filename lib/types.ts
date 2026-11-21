// Shared, client-safe types and pure money helpers (no node imports).

export type Currency = "CAD" | "USD";
export type Status = "draft" | "sent" | "paid" | "void";
export type DisplayStatus = Status | "overdue" | "refunded" | "part_refunded";
export type PaidMethod = "etransfer" | "card" | "eft" | "other";

export const PAID_METHOD_LABEL: Record<PaidMethod, string> = {
  etransfer: "e-Transfer",
  card: "card",
  eft: "EFT",
  other: "other method",
};

export interface LineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
}

export interface Tax {
  name: string;
  rate_percent: number;
}

/** A saved client: the Bill to details, kept so they don't have to be retyped. */
export interface Client {
  id: string;
  name: string;
  company: string;
  email: string;
  cc: string[];
  address: string;
  invoice_count: number;
  /** issue date of the latest invoice with this client name, or null */
  last_invoiced: string | null;
  created_at: string;
  updated_at: string;
}

export interface SendLogEntry {
  to: string[];
  cc: string[];
  message_id: string;
  transport: "gmail" | "file";
  sent_at: string;
}

export interface Invoice {
  id: string;
  number: string;
  status: Status;
  /** status plus derived states: "overdue" (sent, past due), "refunded" / "part_refunded" (paid, then refunded) */
  display_status: DisplayStatus;
  currency: Currency;
  issue_date: string;
  due_date: string;
  bill_to: {
    name: string;
    company: string;
    email: string;
    cc: string[];
    address: string;
  };
  items: LineItem[];
  tax: Tax | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string;
  message: string;
  payment: { etransfer: boolean; card: boolean };
  stripe: { link_id: string | null; url: string | null; active: boolean };
  paid: { at: string; method: PaidMethod; note: string } | null;
  /** money given back after payment; at = YYYY-MM-DD or null when the date was not recorded */
  refund: { cents: number; at: string | null; note: string } | null;
  sent_at: string | null;
  voided_at: string | null;
  sends: SendLogEntry[];
  created_at: string;
  updated_at: string;
}

export interface BusinessProfile {
  display_name: string;
  legal_name: string;
  address: string;
  email: string;
  phone: string;
  tax_number: string;
  etransfer_email: string;
  etransfer_text: string;
  website: string;
  sender_name: string;
  accent_color: string;
}

export function lineAmountCents(it: LineItem): number {
  return Math.round((Number(it.quantity) || 0) * (Number(it.unit_price_cents) || 0));
}

export function computeTotals(items: LineItem[], tax: Tax | null) {
  const subtotal = items.reduce((s, it) => s + lineAmountCents(it), 0);
  const taxCents = tax ? Math.round((subtotal * (Number(tax.rate_percent) || 0)) / 100) : 0;
  return { subtotal_cents: subtotal, tax_cents: taxCents, total_cents: subtotal + taxCents };
}

export function formatMoney(cents: number, currency: Currency = "CAD"): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const s = (abs / 100).toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}$${s} ${currency}`;
}

/** "12.50" / "$1,200" -> cents. Returns NaN when unparseable. */
export function parseMoneyToCents(input: string): number {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return 0;
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return NaN;
  return Math.round(parseFloat(cleaned) * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatDate(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function padNumber(prefix: string, n: number): string {
  // Six digits, matching the GoHighLevel numbering the earlier invoices used (INV-000018).
  return `${prefix}${String(n).padStart(6, "0")}`;
}

/** GHL-style money: CAD -> "CA$1,695.00", USD -> "$2,420.00". */
export function formatMoneyGhl(cents: number, currency: Currency): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/** "2026-11-18" -> "November 18, 2026" */
export function formatLongDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
