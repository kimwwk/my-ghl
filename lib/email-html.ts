// Pure renderer for the invoice email (HTML + plain text), modelled on GoHighLevel's
// "Invoice received" email followed by its hosted-page invoice layout. Safe to import from
// client components so the editor's live preview is the same markup that gets sent.
import { type DocInvoice, buildDocView } from "./invoice-view";
import { type BusinessProfile, formatLongDate, formatMoneyGhl } from "./types";

const FONT = "Ubuntu, Helvetica, Arial, sans-serif";
const INK = "#101828";
const MUTED = "#667085";
const HAIR = "#eaecf0";

export function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
const nl = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

export function emailSubject(inv: { number: string }, b: Pick<BusinessProfile, "display_name">) {
  return `[${b.display_name || "Invoice"}] Invoice ${inv.number}`;
}

export interface RenderInput {
  invoice: DocInvoice;
  business: BusinessProfile;
  /** img src for the logo: "cid:kivov-logo" when sending, "/api/logo" in the preview */
  logoSrc: string;
  /** Stripe Payment Link; when null but card is on, the button renders as a placeholder */
  payUrl: string | null;
}

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] || "there";
}

export function renderInvoiceEmail(input: RenderInput): { html: string; text: string } {
  const { invoice: inv, business: b, logoSrc, payUrl } = input;
  const v = buildDocView(inv, b);
  const accent = v.accent;
  const first = firstName(inv.bill_to.name);
  const amountDue = formatMoneyGhl(inv.total_cents, inv.currency);
  const showPay = inv.payment.card && inv.status !== "paid" && inv.status !== "void";
  const payHref = payUrl ? esc(payUrl) : "#";

  // Gmail turns bare addresses and URLs into its own blue links, so we link them ourselves
  // in the colour of the text around them. Numbers and dates never break across lines.
  const link = (href: string, label: string, style: string) =>
    `<a href="${esc(href)}" target="_blank" style="${style}text-decoration:none;">${esc(label)}</a>`;
  const nowrap = (inner: string) => `<span style="white-space:nowrap;">${inner}</span>`;
  // Gmail's apps turn anything that looks like a street address into a Google Maps link. An
  // invisible zero-width non-joiner before each space breaks its pattern; the text looks the same.
  const noMap = (s: string) => esc(s).replace(/ /g, "&zwnj; ");

  const row = (inner: string, pad = "10px 20px") =>
    `<tr><td align="left" style="padding:${pad};word-break:break-word;">${inner}</td></tr>`;
  const txt = (inner: string) =>
    `<div style="font-family:${FONT};font-size:14px;line-height:1.5;color:#000000;">${inner}</div>`;
  const p = (inner: string) => `<p style="margin:0 0 13px 0;line-height:1.5;">${inner}</p>`;

  // ---------- part 1: the letter (GHL's notification email) ----------
  const logoImg = `<img src="${esc(logoSrc)}" alt="${esc(b.display_name)}" height="48" style="display:block;border:0;height:48px;width:auto;max-height:48px;max-width:180px;">`;
  const intro = [
    row(logoImg),
    row(`<h2 style="margin:0;font-family:${FONT};font-size:24px;line-height:1.5;font-weight:700;color:#000000;">Invoice for ${esc(first)}</h2>`),
    row(
      txt(
        p(`Hi ${esc(first)},`) +
          p(
            `${esc(b.display_name)} sent you invoice ${nowrap(esc(inv.number))} for ${nowrap(esc(amountDue))} that&rsquo;s due on ${nowrap(esc(formatLongDate(inv.due_date)))}.`,
          ) +
          (inv.message.trim() ? p(nl(inv.message)) : ""),
      ),
    ),
  ];
  if (showPay) {
    intro.push(
      row(
        `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;line-height:100%;"><tr>
<td align="center" bgcolor="${accent}" style="background:${accent};border-radius:3px;"><a href="${payHref}" target="_blank" style="display:inline-block;padding:11px 25px;font-family:Helvetica, Arial, sans-serif;font-size:14px;font-weight:700;line-height:120%;color:#ffffff;text-decoration:none;">Pay invoice</a></td></tr></table>`,
        "0 20px",
      ),
      row(
        txt(
          p(
            `Unable to see the button? <a href="${payHref}" target="_blank" style="color:${accent};text-decoration:underline;">Pay invoice</a>${payUrl ? "" : ` <span style="color:${MUTED};">(link is created when the invoice is sent)</span>`}`,
          ),
        ),
      ),
    );
  }
  intro.push(
    row(
      txt(
        `<p style="margin:0 0 13px 0;">Regards,</p><p style="margin:0 0 13px 0;">${esc(b.sender_name || b.display_name)}</p><p style="margin:0;">${esc(b.display_name)}</p>`,
      ),
    ),
  );

  // ---------- part 2: the invoice document, on its own panel ----------
  const label = (t: string) =>
    `<div style="font-family:${FONT};font-size:13px;font-weight:500;line-height:20px;color:${INK};white-space:nowrap;">${esc(t)}</div>`;
  const value = (t: string, extra = "") =>
    `<div style="font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};${extra}">${t}</div>`;
  const muted = `color:${MUTED};`;

  const bizLine = (l: string) => {
    if (b.website && l === b.website) return link(/^https?:\/\//i.test(l) ? l : `https://${l}`, l, muted);
    if (b.email && l === b.email) return link(`mailto:${l}`, l, muted);
    if (b.phone && l === b.phone) {
      const digits = l.replace(/[^\d+]/g, "");
      return digits ? link(`tel:${digits}`, l, muted) : esc(l);
    }
    return noMap(l);
  };

  const titleBlock = `<tr><td align="right" style="padding:0;border-bottom:1px solid #000000;font-family:${FONT};font-size:34px;line-height:44px;font-weight:500;color:#000000;">INVOICE</td></tr>`;

  const bizBlock = `<tr><td style="padding:20px 0 16px 0;border-bottom:1px solid ${HAIR};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top" align="left"><img src="${esc(logoSrc)}" alt="" height="48" style="display:block;border:0;height:48px;width:auto;max-height:48px;max-width:180px;"></td>
<td valign="top" align="right" style="font-family:${FONT};">
<div style="font-size:17px;line-height:24px;color:#000000;">${esc(v.business.name)}</div>
${v.business.lines.map((l) => `<div style="font-size:12px;line-height:19px;color:${MUTED};">${bizLine(l)}</div>`).join("")}
</td></tr></table></td></tr>`;

  // Billed to / Invoice No / Dates: three columns on a wide screen. On a phone they wrap
  // (Billed to on top, Invoice No and the dates side by side) instead of squeezing.
  // The [if mso] tables give Outlook for Windows, which ignores inline-block, real columns.
  const col = (w: number, inner: string) =>
    `<!--[if mso]><td valign="top" width="${w}"><![endif]--><div style="display:inline-block;vertical-align:top;width:100%;max-width:${w}px;"><div style="padding:0 12px 14px 0;">${inner}</div></div><!--[if mso]></td><![endif]-->`;
  const billedTo = v.billedTo
    .map((l) => value(inv.bill_to.email && l === inv.bill_to.email ? link(`mailto:${l}`, l, muted) : noMap(l), "word-break:break-word;"))
    .join("");
  const meta = `<tr><td style="padding:18px 0 8px 0;font-size:0;line-height:0;">
<!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><![endif]-->${col(240, label("Billed to") + billedTo)}${col(110, label("Invoice No") + value(esc(v.number), "white-space:nowrap;"))}${col(
    170,
    label("Issue Date") +
      value(esc(v.issueDate), "white-space:nowrap;") +
      `<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>` +
      label("Due Date") +
      value(esc(v.dueDate), "white-space:nowrap;"),
  )}<!--[if mso]></tr></table><![endif]-->
</td></tr>`;

  const th = (t: string, align: string, w = "") =>
    `<td ${w} align="${align}" style="padding:10px 0;border-bottom:2px solid ${accent};font-family:${FONT};font-size:11px;font-weight:500;letter-spacing:0.4px;text-transform:uppercase;color:#000000;">${t}</td>`;
  const td = (inner: string, align: string, extra = "") =>
    `<td align="${align}" valign="top" style="padding:9px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${INK};${extra}">${inner}</td>`;
  // The description gets its own row spanning the table, so on a phone it uses the full width
  // instead of a narrow name column; the inner max-width keeps it under the name on desktop.
  const items = v.rows
    .map((r) => {
      const tight = r.description ? "padding-bottom:2px;" : "";
      const main = `<tr>
${td(esc(r.name), "left", `padding-right:8px;${tight}`)}
${td(esc(r.price), "right", `white-space:nowrap;padding-left:8px;${tight}`)}
${td(esc(r.qty), "center", `width:36px;${tight}`)}
${td(esc(r.tax), "center", `width:44px;${tight}`)}
${td(esc(r.subtotal), "right", `white-space:nowrap;padding-left:8px;${tight}`)}</tr>`;
      const desc = r.description
        ? `<tr><td colspan="5" style="padding:0 0 9px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${MUTED};"><div style="max-width:380px;">${nl(r.description)}</div></td></tr>`
        : "";
      return main + desc;
    })
    .join("");
  const itemsTable = `<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr>${th("Item name", "left")}${th("Price", "right")}${th("Qty", "center", 'width="36"')}${th("Tax", "center", 'width="44"')}${th("Subtotal", "right")}</tr>
${items}
<tr><td colspan="5" style="border-top:1px solid ${HAIR};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
</table></td></tr>`;

  const totalRows = v.totals
    .map((t) => {
      const top = t.rule ? `border-top:1px solid ${HAIR};` : "";
      const lab = t.strong
        ? `font-size:15px;font-weight:500;color:#000000;padding-top:12px;`
        : `font-size:12px;font-weight:700;color:${INK};padding-top:7px;`;
      const val = t.strong
        ? `font-size:13px;font-weight:700;color:#000000;padding-top:12px;`
        : `font-size:12px;color:${MUTED};padding-top:7px;`;
      return `<tr><td style="${top}${lab}padding-bottom:6px;padding-left:12px;padding-right:12px;font-family:${FONT};white-space:nowrap;">${esc(t.label)}</td><td align="right" style="${top}${val}padding-bottom:6px;font-family:${FONT};white-space:nowrap;">${esc(t.value)}</td></tr>`;
    })
    .join("");
  // Up to 300px wide on the right; on a phone it takes the full width rather than wrapping labels.
  const totals = `<tr><td align="right" style="padding-top:6px;">
<!--[if mso]><table role="presentation" align="right" width="300" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" align="right" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:300px;border-collapse:collapse;">${totalRows}</table>
<!--[if mso]></td></tr></table><![endif]--></td></tr>`;

  let stamp = "";
  if (v.stamp) {
    const bg = v.stamp.kind === "paid" ? "#f0fdf4" : "#f2f4f7";
    stamp = `<tr><td style="padding-top:20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${bg}" style="background:${bg};padding:30px 10px;font-family:${FONT};">
<div style="font-size:18px;line-height:26px;color:#000000;">${v.stamp.title}</div>${v.stamp.sub ? `<div style="font-size:12px;line-height:20px;color:${MUTED};">${esc(v.stamp.sub)}</div>` : ""}</td></tr></table></td></tr>`;
  }

  // The e-Transfer address is what the client copies, so it is bold, linked in the text colour
  // and kept on one line; the invoice number is kept on one line too.
  const termHtml = (t: string) => {
    let h = nl(t);
    if (b.etransfer_email)
      h = h.split(esc(b.etransfer_email)).join(nowrap(link(`mailto:${b.etransfer_email}`, b.etransfer_email, "color:#000000;font-weight:700;")));
    return h.split(esc(inv.number)).join(nowrap(esc(inv.number)));
  };
  const terms = v.terms.length
    ? `<tr><td style="padding-top:26px;font-family:${FONT};">
<div style="font-size:13px;font-weight:700;line-height:20px;color:${INK};padding-bottom:6px;">Terms &amp; Notes:</div>
${v.terms.map((t) => `<p style="margin:0 0 12px 0;font-size:13px;line-height:1.7;color:#000000;">${termHtml(t)}</p>`).join("")}
</td></tr>`
    : "";

  const doc = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${titleBlock}${bizBlock}${meta}${itemsTable}${totals}${stamp}${terms}
<tr><td style="padding-top:14px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">This invoice is also attached to this email as ${nowrap(`${esc(inv.number)}.pdf`)}.</td></tr>
</table>`;

  // Two white panels on the light-blue background: the letter, then the invoice. The gap
  // between them shows where the letter ends, so "Regards" no longer runs into the invoice.
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only">
<title>${esc(emailSubject(inv, b))}</title>
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css?family=Ubuntu:300,400,500,700&display=swap" rel="stylesheet" type="text/css"><style type="text/css">@import url(https://fonts.googleapis.com/css?family=Ubuntu:300,400,500,700&display=swap);</style><!--<![endif]-->
</head>
<body style="margin:0;padding:0;word-spacing:normal;background:#EAF0F6;">
<div style="background:#EAF0F6;padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EAF0F6" style="background:#EAF0F6;"><tr><td align="center" style="padding:0;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:10px 0 14px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${intro.join("\n")}
</table></td></tr>
<tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:30px 20px;">${doc}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</div>
</body></html>`;

  // ---------- plain text ----------
  const t: string[] = [];
  t.push(`Invoice for ${first}`, "", `Hi ${first},`, "");
  t.push(`${b.display_name} sent you invoice ${inv.number} for ${amountDue} that's due on ${formatLongDate(inv.due_date)}.`, "");
  if (inv.message.trim()) t.push(inv.message.trim(), "");
  if (showPay) t.push(`Pay invoice: ${payUrl ?? "(link created when sent)"}`, "");
  t.push("Regards,", b.sender_name || b.display_name, b.display_name, "");
  t.push("----------------------------------------", "INVOICE", "");
  t.push(v.business.name, ...v.business.lines, "");
  t.push("Billed to", ...v.billedTo, "");
  t.push(`Invoice No: ${v.number}`, `Issue Date: ${v.issueDate}`, `Due Date: ${v.dueDate}`, "");
  t.push("ITEMS (name | price | qty | tax | subtotal)");
  for (const r of v.rows) {
    t.push(`- ${r.name} | ${r.price} | ${r.qty} | ${r.tax} | ${r.subtotal}`);
    if (r.description) t.push(`  ${r.description.replace(/\n/g, "\n  ")}`);
  }
  t.push("");
  for (const x of v.totals) t.push(`${x.label}: ${x.value}`);
  if (v.stamp) t.push("", `${v.stamp.title} ${v.stamp.sub}`.trim());
  if (v.terms.length) t.push("", "Terms & Notes:", ...v.terms.flatMap((x) => [x, ""]));
  t.push("", `The invoice is also attached as ${inv.number}.pdf.`);
  return { html, text: t.join("\n") };
}
