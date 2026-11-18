// View model for the invoice document, shared by the email HTML, the plain-text part and the PDF.
import {
  type BusinessProfile,
  type Invoice,
  formatLongDate,
  formatMoneyGhl,
  lineAmountCents,
} from "./types";

export type DocInvoice = Pick<
  Invoice,
  | "number"
  | "status"
  | "currency"
  | "issue_date"
  | "due_date"
  | "bill_to"
  | "items"
  | "tax"
  | "subtotal_cents"
  | "tax_cents"
  | "total_cents"
  | "notes"
  | "message"
  | "payment"
  | "paid"
  | "voided_at"
>;

export interface DocView {
  number: string;
  currency: string;
  business: { name: string; lines: string[] };
  billedTo: string[];
  issueDate: string;
  dueDate: string;
  rows: { name: string; description: string; price: string; qty: string; tax: string; subtotal: string }[];
  totals: { label: string; value: string; strong?: boolean; rule?: boolean }[];
  stamp: { title: string; sub: string; kind: "paid" | "void" } | null;
  terms: string[];
  accent: string;
}

export function etransferParagraph(inv: DocInvoice, b: BusinessProfile): string {
  if (!inv.payment.etransfer || !(b.etransfer_email || b.etransfer_text)) return "";
  const t = (b.etransfer_text || "").trim()
    ? b.etransfer_text
    : `Send an Interac e-Transfer to {email} and put the invoice number ({invoice}) in the message.`;
  return t.replace(/\{invoice\}/gi, inv.number).replace(/\{email\}/gi, b.etransfer_email).trim();
}

export function buildDocView(inv: DocInvoice, b: BusinessProfile): DocView {
  const cur = inv.currency;
  const m = (c: number) => formatMoneyGhl(c, cur);
  const taxLabel = inv.tax ? `${inv.tax.rate_percent}%` : "-";
  const rows = inv.items
    .filter((it) => it.description.trim() || it.unit_price_cents)
    .map((it) => {
      const lines = it.description.split(/\r?\n/);
      return {
        name: lines[0].trim(),
        description: lines.slice(1).join("\n").trim(),
        price: m(it.unit_price_cents),
        qty: String(it.quantity),
        tax: taxLabel,
        subtotal: m(lineAmountCents(it)),
      };
    });

  const totals: DocView["totals"] = [{ label: "Subtotal", value: m(inv.subtotal_cents) }];
  if (inv.tax) {
    const n = inv.tax.name.trim() || "Tax";
    totals.push({ label: `${n} (${inv.tax.rate_percent}%)`, value: m(inv.tax_cents) });
  }
  const paid = inv.status === "paid" && inv.paid;
  if (paid) {
    totals.push({ label: `Total (${cur})`, value: m(inv.total_cents), rule: true });
    totals.push({ label: `Amount Paid (${cur})`, value: m(inv.total_cents) });
    totals.push({ label: `Amount Due (${cur})`, value: m(0), strong: true, rule: true });
  } else {
    totals.push({ label: `Amount Due (${cur})`, value: m(inv.total_cents), strong: true, rule: true });
  }

  let stamp: DocView["stamp"] = null;
  if (paid && inv.paid) stamp = { title: "PAID", sub: `(Completed on: ${formatLongDate(inv.paid.at)})`, kind: "paid" };
  else if (inv.status === "void")
    stamp = {
      title: "VOID",
      sub: inv.voided_at ? `(Voided on: ${formatLongDate(inv.voided_at.slice(0, 10))})` : "",
      kind: "void",
    };

  const terms = [etransferParagraph(inv, b), ...inv.notes.split(/\n{2,}/).map((x) => x.trim())].filter(Boolean);

  return {
    number: inv.number,
    currency: cur,
    business: {
      name: b.display_name,
      lines: [
        ...(b.legal_name && b.legal_name !== b.display_name ? [b.legal_name] : []),
        ...b.address.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
        ...[b.email, b.phone, b.website].filter(Boolean),
        ...(b.tax_number ? [`Tax no. ${b.tax_number}`] : []),
      ],
    },
    billedTo: [
      inv.bill_to.company,
      inv.bill_to.name,
      inv.bill_to.email,
      ...inv.bill_to.address.split(/\r?\n/).map((x) => x.trim()),
    ].filter(Boolean),
    issueDate: formatLongDate(inv.issue_date),
    dueDate: formatLongDate(inv.due_date),
    rows,
    totals,
    stamp,
    terms,
    accent: b.accent_color,
  };
}
