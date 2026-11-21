import fs from "node:fs";
import path from "node:path";
import MailComposer from "nodemailer/lib/mail-composer";
import sharp from "sharp";
import { DATA_DIR } from "./db";
import { emailMode, getSettings } from "./settings";
import { gmailSend, googleConnected } from "./google";

export const LOGO_CID = "kivov-logo";

export function logoFile(): { buf: Buffer; contentType: string; filename: string } {
  const s = getSettings();
  if (s.logo_ext) {
    const p = path.join(DATA_DIR, `logo.${s.logo_ext}`);
    if (fs.existsSync(p)) {
      const ct = s.logo_ext === "jpg" || s.logo_ext === "jpeg" ? "image/jpeg" : s.logo_ext === "svg" ? "image/svg+xml" : `image/${s.logo_ext}`;
      return { buf: fs.readFileSync(p), contentType: ct, filename: `logo.${s.logo_ext}` };
    }
  }
  return {
    buf: fs.readFileSync(path.join(process.cwd(), "public", "kivov-wordmark.png")),
    contentType: "image/png",
    filename: "logo.png",
  };
}

/**
 * The logo as sent in emails: 96px tall (twice the 48px it is shown at) and flattened onto
 * white. The wordmark is black on transparent, so a mail app in dark mode would otherwise
 * draw it black on a dark background, where it disappears. The PDF keeps the original.
 */
export async function emailLogo(): Promise<{ buf: Buffer; contentType: string; filename: string }> {
  const l = logoFile();
  try {
    const buf = await sharp(l.buf, { density: 288 })
      .flatten({ background: "#ffffff" })
      .resize({ height: 96 })
      .png()
      .toBuffer();
    return { buf, contentType: "image/png", filename: "logo.png" };
  } catch {
    return l;
  }
}

export interface OutgoingMail {
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  text: string;
  /** label used for the .eml filename in file mode, e.g. the invoice number */
  label: string;
  pdf?: { filename: string; content: Buffer };
}

export function transportReady(): { ok: boolean; reason?: string } {
  if (emailMode() === "file") return { ok: true };
  if (googleConnected()) return { ok: true };
  return { ok: false, reason: "Connect Google in Settings > Email before sending." };
}

export async function buildMime(mail: OutgoingMail, from: string, replyTo?: string): Promise<Buffer> {
  const logo = await emailLogo();
  const composer = new MailComposer({
    from,
    to: mail.to,
    cc: mail.cc.length ? mail.cc : undefined,
    replyTo: replyTo || undefined,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: [
      {
        filename: logo.filename,
        content: logo.buf,
        contentType: logo.contentType,
        cid: LOGO_CID,
        contentDisposition: "inline",
      },
      ...(mail.pdf
        ? [{ filename: mail.pdf.filename, content: mail.pdf.content, contentType: "application/pdf" }]
        : []),
    ],
  });
  return new Promise((resolve, reject) => {
    composer.compile().build((err, msg) => (err ? reject(err) : resolve(msg)));
  });
}

export async function deliver(mail: OutgoingMail): Promise<{ message_id: string; transport: "gmail" | "file" }> {
  const s = getSettings();
  const mode = emailMode();
  const fromAddr = mode === "file" ? s.google_email || s.email || "invoices@localhost" : s.google_email;
  if (mode === "gmail" && !fromAddr) throw new Error("Connect Google in Settings > Email before sending.");
  const from = `"${(s.business_name || "Invoices").replace(/"/g, "")}" <${fromAddr}>`;
  const raw = await buildMime(mail, from, s.email && s.email !== fromAddr ? s.email : undefined);
  if (mode === "file") {
    const dir = path.join(DATA_DIR, "outbox");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(dir, `${mail.label}-${stamp}.eml`);
    fs.writeFileSync(file, raw);
    return { message_id: `file:${path.basename(file)}`, transport: "file" };
  }
  const id = await gmailSend(raw);
  return { message_id: id, transport: "gmail" };
}
