// Pure renderer for the invoice email (HTML + plain text). Safe to import from client
// components so the editor's live preview is the exact same markup that gets sent.
import {
  type BusinessProfile,
  type Invoice,
  formatDate,
  formatMoney,
  lineAmountCents,
} from "./types";

export const C = {
  cream: "#fbfaf4",
  ink: "#17201b",
  green: "#0a6e48",
  forest: "#07452e",
  hair: "#e2e4dc",
  soft: "#edf2e9",
  body: "#4c564f",
  caption: "#6b756d",
};

const SANS = "'Work Sans', Helvetica, Arial, sans-serif";
const HEAD = "'Archivo', 'Arial Black', Helvetica, Arial, sans-serif";
const MONO = "'IBM Plex Mono', 'Courier New', Courier, monospace";

export function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
const nl = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

export function emailSubject(inv: Pick<Invoice, "number">, b: Pick<BusinessProfile, "display_name">) {
  return `Invoice ${inv.number} from ${b.display_name || "us"}`;
}

export interface RenderInput {
  invoice: Pick<
    Invoice,
    | "number"
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
  >;
  business: BusinessProfile;
  /** img src for the logo: "cid:kivov-logo" when sending, "/api/logo" in the preview */
  logoSrc: string;
  /** Stripe Payment Link; when null but card is on, the button renders as a placeholder */
  payUrl: string | null;
}

function label(text: string, color = C.caption) {
  return `<div style="font-family:${MONO};font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${color};line-height:16px;">${esc(text)}</div>`;
}

function band(bg: string, inner: string, borderBottom = false) {
  return `<tr><td style="background:${bg};${borderBottom ? `border-bottom:1px solid ${C.hair};` : ""}padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;"><tr><td style="padding:28px 28px;">${inner}</td></tr></table>
</td></tr>`;
}

export function renderInvoiceEmail(input: RenderInput): { html: string; text: string } {
  const { invoice: inv, business: b, logoSrc, payUrl } = input;
  const cur = inv.currency;
  const money = (c: number) => formatMoney(c, cur);
  const greetingName = inv.bill_to.name.trim().split(/\s+/)[0] || "there";
  const wantCard = inv.payment.card;
  const wantEt = inv.payment.etransfer;

  // --- header band
  const header = `<tr><td style="background:${C.cream};border-bottom:1px solid ${C.hair};padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;"><tr>
<td style="padding:20px 28px;" align="left"><img src="${esc(logoSrc)}" alt="${esc(b.display_name)}" height="34" style="display:block;height:34px;width:auto;border:0;"></td>
<td style="padding:20px 28px;" align="right">${label("Invoice")}<div style="font-family:${MONO};font-size:14px;color:${C.ink};line-height:20px;">${esc(inv.number)}</div></td>
</tr></table></td></tr>`;

  // --- hero band (green)
  const hero = band(
    C.green,
    `${label("Amount due", "#bfe5cf")}
<div style="font-family:${HEAD};font-size:40px;line-height:46px;font-weight:900;color:${C.cream};padding-top:6px;">${esc(money(inv.total_cents))}</div>
<div style="font-family:${SANS};font-size:15px;line-height:22px;color:${C.cream};padding-top:10px;">Due ${esc(formatDate(inv.due_date))} &nbsp;&middot;&nbsp; Issued ${esc(formatDate(inv.issue_date))}</div>`,
  );

  // --- greeting
  const greeting = band(
    C.cream,
    `<div style="font-family:${SANS};font-size:16px;line-height:25px;color:${C.body};">
<div style="color:${C.ink};">Hi ${esc(greetingName)},</div>
<div style="padding-top:12px;">${
      inv.message.trim()
        ? nl(inv.message)
        : `Please find invoice ${esc(inv.number)} from ${esc(b.display_name)} below.`
    }</div></div>`,
  );

  // --- pay by card CTA
  let cta = "";
  if (wantCard) {
    const href = payUrl ? esc(payUrl) : "#";
    cta = `<tr><td style="background:${C.cream};padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;"><tr><td style="padding:0 28px 28px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${C.green};border-radius:999px;"><a href="${href}" style="display:inline-block;font-family:${SANS};font-size:16px;font-weight:600;color:${C.cream};text-decoration:none;padding:14px 32px;">Pay by card &mdash; ${esc(money(inv.total_cents))}</a></td></tr></table>
<div style="font-family:${SANS};font-size:13px;line-height:19px;color:${C.caption};padding-top:10px;">Secure checkout by Stripe.${payUrl ? "" : " (Link is created when the invoice is sent.)"}</div>
</td></tr></table></td></tr>`;
  }

  // --- invoice table
  const th = (t: string, align = "left") =>
    `<td align="${align}" style="padding:10px 0;border-bottom:1px solid ${C.ink};font-family:${MONO};font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${C.caption};">${t}</td>`;
  const rows = inv.items
    .filter((it) => it.description.trim() || it.unit_price_cents)
    .map(
      (it) => `<tr>
<td style="padding:12px 12px 12px 0;border-bottom:1px solid ${C.hair};font-family:${SANS};font-size:15px;line-height:22px;color:${C.ink};vertical-align:top;">${nl(it.description)}</td>
<td align="right" style="padding:12px 0;border-bottom:1px solid ${C.hair};font-family:${SANS};font-size:15px;color:${C.body};vertical-align:top;white-space:nowrap;">${esc(String(it.quantity))}</td>
<td align="right" style="padding:12px 0 12px 12px;border-bottom:1px solid ${C.hair};font-family:${SANS};font-size:15px;color:${C.body};vertical-align:top;white-space:nowrap;">${esc(money(it.unit_price_cents))}</td>
<td align="right" style="padding:12px 0 12px 12px;border-bottom:1px solid ${C.hair};font-family:${SANS};font-size:15px;color:${C.ink};vertical-align:top;white-space:nowrap;">${esc(money(lineAmountCents(it)))}</td></tr>`,
    )
    .join("");
  const totalRow = (k: string, v: string, strong = false) =>
    `<tr><td colspan="2"></td><td align="right" style="padding:8px 0 8px 12px;font-family:${strong ? MONO : SANS};font-size:${strong ? 12 : 14}px;${strong ? "letter-spacing:1.2px;text-transform:uppercase;" : ""}color:${strong ? C.ink : C.body};${strong ? `border-top:1px solid ${C.ink};` : ""}">${esc(k)}</td><td align="right" style="padding:8px 0 8px 12px;font-family:${strong ? HEAD : SANS};font-size:${strong ? 18 : 14}px;${strong ? "font-weight:800;" : ""}color:${C.ink};white-space:nowrap;${strong ? `border-top:1px solid ${C.ink};` : ""}">${esc(v)}</td></tr>`;
  const taxRow = inv.tax
    ? totalRow(`${inv.tax.name || "Tax"}${inv.tax.name.includes("%") ? "" : ` ${inv.tax.rate_percent}%`}`, money(inv.tax_cents))
    : "";

  const billTo = [inv.bill_to.company, inv.bill_to.name].filter(Boolean).map((l, i) => i === 0 && inv.bill_to.company ? `<strong style="color:${C.ink};">${esc(l)}</strong>` : esc(l)).join("<br>");
  const billAddr = inv.bill_to.address.trim() ? `<br>${nl(inv.bill_to.address)}` : "";
  const billMail = inv.bill_to.email ? `<br>${esc(inv.bill_to.email)}` : "";
  const fromLines = [
    `<strong style="color:${C.ink};">${esc(b.display_name)}</strong>`,
    b.legal_name && b.legal_name !== b.display_name ? esc(b.legal_name) : "",
    b.address.trim() ? nl(b.address) : "",
    b.email ? esc(b.email) : "",
    b.tax_number ? `Tax no. ${esc(b.tax_number)}` : "",
  ]
    .filter(Boolean)
    .join("<br>");

  const table = band(
    C.cream,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top" width="50%" style="padding-right:12px;font-family:${SANS};font-size:14px;line-height:21px;color:${C.body};">${label("Bill to")}<div style="padding-top:6px;">${billTo}${billAddr}${billMail}</div></td>
<td valign="top" width="50%" style="padding-left:12px;font-family:${SANS};font-size:14px;line-height:21px;color:${C.body};">${label("From")}<div style="padding-top:6px;">${fromLines}</div></td>
</tr></table>
<div style="height:26px;line-height:26px;font-size:0;">&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>${th("Description")}${th("Qty", "right")}${th("Unit price", "right")}${th("Amount", "right")}</tr>
${rows}
${totalRow("Subtotal", money(inv.subtotal_cents))}
${taxRow}
${totalRow(`Total ${cur}`, money(inv.total_cents), true)}
</table>`,
    true,
  );

  // --- e-Transfer
  let et = "";
  if (wantEt && (b.etransfer_email || b.etransfer_text)) {
    const instr = (b.etransfer_text || "")
      .replace(/\{invoice\}/gi, inv.number)
      .replace(/\{email\}/gi, b.etransfer_email);
    et = band(
      C.soft,
      `${label("Pay by Interac e-Transfer", C.forest)}
<div style="font-family:${SANS};font-size:15px;line-height:23px;color:${C.ink};padding-top:8px;">${instr.trim() ? nl(instr) : `Send an Interac e-Transfer to <strong>${esc(b.etransfer_email)}</strong> and put <strong>${esc(inv.number)}</strong> in the message.`}</div>
${b.etransfer_email ? `<div style="font-family:${MONO};font-size:14px;color:${C.forest};padding-top:10px;">${esc(b.etransfer_email)}</div>` : ""}`,
      true,
    );
  }

  // --- notes
  const notes = inv.notes.trim()
    ? band(
        C.cream,
        `${label("Notes and terms")}<div style="font-family:${SANS};font-size:14px;line-height:22px;color:${C.body};padding-top:6px;">${nl(inv.notes)}</div>`,
      )
    : "";

  // --- footer band
  const footer = band(
    C.forest,
    `<div style="font-family:${SANS};font-size:13px;line-height:20px;color:#d7e6dc;">
<strong style="color:${C.cream};">${esc(b.display_name)}</strong>${b.legal_name && b.legal_name !== b.display_name ? ` &middot; ${esc(b.legal_name)}` : ""}<br>
${[b.address.replace(/\r?\n/g, ", "), b.email, b.phone, b.tax_number ? `Tax no. ${b.tax_number}` : ""].filter(Boolean).map(esc).join(" &middot; ")}
</div>`,
  );

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(emailSubject(inv, b))}</title></head>
<body style="margin:0;padding:0;background:${C.cream};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.cream};">
${header}
${hero}
${greeting}
${cta}
${table}
${et}
${notes}
${footer}
</table>
</body></html>`;

  // --- plain text
  const t: string[] = [];
  t.push(`Invoice ${inv.number} from ${b.display_name}`, "");
  t.push(`Hi ${greetingName},`, "");
  t.push(inv.message.trim() || `Please find invoice ${inv.number} from ${b.display_name} below.`, "");
  t.push(`Amount due: ${money(inv.total_cents)}`, `Due: ${formatDate(inv.due_date)}   Issued: ${formatDate(inv.issue_date)}`, "");
  if (wantCard) t.push(`Pay by card: ${payUrl ?? "(link created when sent)"}`, "");
  t.push("BILL TO", ...[inv.bill_to.company, inv.bill_to.name, inv.bill_to.address, inv.bill_to.email].filter(Boolean), "");
  t.push("FROM", ...[b.display_name, b.legal_name, b.address, b.email, b.phone, b.tax_number && `Tax no. ${b.tax_number}`].filter(Boolean) as string[], "");
  t.push("ITEMS");
  for (const it of inv.items.filter((i) => i.description.trim() || i.unit_price_cents)) {
    t.push(`- ${it.description} | ${it.quantity} x ${money(it.unit_price_cents)} = ${money(lineAmountCents(it))}`);
  }
  t.push("", `Subtotal: ${money(inv.subtotal_cents)}`);
  if (inv.tax) t.push(`${inv.tax.name || "Tax"} ${inv.tax.rate_percent}%: ${money(inv.tax_cents)}`);
  t.push(`Total: ${money(inv.total_cents)}`, "");
  if (wantEt && (b.etransfer_email || b.etransfer_text)) {
    t.push("PAY BY INTERAC E-TRANSFER");
    t.push(
      (b.etransfer_text || `Send an Interac e-Transfer to ${b.etransfer_email} and put ${inv.number} in the message.`)
        .replace(/\{invoice\}/gi, inv.number)
        .replace(/\{email\}/gi, b.etransfer_email),
    );
    t.push("");
  }
  if (inv.notes.trim()) t.push("NOTES & TERMS", inv.notes, "");
  t.push("--", [b.display_name, b.legal_name, b.email, b.phone].filter(Boolean).join(" | "));
  return { html, text: t.join("\n") };
}
