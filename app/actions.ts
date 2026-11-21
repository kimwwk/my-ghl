"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { DATA_DIR } from "@/lib/db";
import {
  ApiError,
  createInvoice,
  deleteDraft,
  duplicateInvoice,
  parseInvoiceInput,
  updateInvoice,
} from "@/lib/invoices";
import { createClient, deleteClient, parseClientInput, updateClient } from "@/lib/clients";
import { disconnectGoogle } from "@/lib/google";
import { saveSettings as persistSettings, getSettings, type Settings } from "@/lib/settings";
import { markPaid, recordRefund, sendInvoice, sendTestEmail, syncInvoice, voidInvoice } from "@/lib/service";
import { parseMoneyToCents } from "@/lib/types";
import { stripeMode, testStripe } from "@/lib/stripe";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function wrap<T extends object>(fn: () => Promise<T> | T): Promise<R<T>> {
  try {
    const v = await fn();
    revalidatePath("/", "layout");
    return { ok: true, ...v };
  } catch (e) {
    if (!(e instanceof ApiError)) console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveInvoiceAction(id: string | null, input: unknown) {
  return wrap(() => {
    const parsed = parseInvoiceInput(input);
    const inv = id ? updateInvoice(id, parsed) : createInvoice(parsed);
    return { id: inv.id };
  });
}

export async function saveClientAction(id: string | null, input: unknown) {
  return wrap(() => {
    const b = parseClientInput(input);
    return { id: (id ? updateClient(id, b) : createClient(b)).id };
  });
}

export async function deleteClientAction(id: string) {
  return wrap(() => {
    deleteClient(id);
    return {};
  });
}

export async function sendInvoiceAction(id: string, to?: string, cc?: string) {
  return wrap(async () => {
    const inv = await sendInvoice(id, { to: to || undefined, cc: cc === undefined ? undefined : cc });
    const last = inv.sends[inv.sends.length - 1];
    return { id: inv.id, to: last?.to.join(", ") ?? "" };
  });
}

export async function markPaidAction(id: string, method: string, date: string, note: string) {
  return wrap(async () => ({ id: (await markPaid(id, { method, date, note })).id }));
}

export async function recordRefundAction(id: string, amount: string, date: string, note: string) {
  return wrap(() => {
    const cents = parseMoneyToCents(amount);
    if (Number.isNaN(cents)) throw new ApiError(400, "Refund amount is not a number.");
    return { id: recordRefund(id, { amount_cents: cents, date, note }).id };
  });
}

export async function voidInvoiceAction(id: string) {
  return wrap(async () => {
    const r = await voidInvoice(id);
    return { id: r.invoice.id, warning: r.warning ?? "" };
  });
}

export async function duplicateInvoiceAction(id: string) {
  return wrap(() => ({ id: duplicateInvoice(id).id }));
}

export async function deleteDraftAction(id: string) {
  return wrap(() => {
    deleteDraft(id);
    return {};
  });
}

export async function syncInvoiceAction(id: string) {
  return wrap(async () => ({ note: (await syncInvoice(id)).note }));
}

export type SettingsInput = Omit<Settings, "next_number" | "default_tax_rate" | "terms_days" | "logo_ext" | "google_refresh_token" | "google_email"> & {
  next_number: number | string;
  default_tax_rate: number | string;
  terms_days: number | string;
};

export async function saveSettingsAction(v: SettingsInput) {
  return wrap(() => {
    const num = (x: number | string, name: string, min = 0) => {
      const n = Number(x);
      if (!Number.isFinite(n) || n < min) throw new Error(`${name} must be a number >= ${min}`);
      return n;
    };
    const cur = getSettings();
    const patch: Partial<Settings> = {
      business_name: v.business_name.trim() || "Kivov Digital",
      legal_name: v.legal_name.trim(),
      address: v.address,
      email: v.email.trim(),
      phone: v.phone.trim(),
      tax_number: v.tax_number.trim(),
      invoice_prefix: v.invoice_prefix,
      next_number: Math.floor(num(v.next_number, "Next number", 1)),
      default_currency: v.default_currency === "USD" ? "USD" : "CAD",
      default_tax_enabled: !!v.default_tax_enabled,
      default_tax_name: v.default_tax_name.trim(),
      default_tax_rate: num(v.default_tax_rate, "Default tax rate", 0),
      default_notes: v.default_notes,
      terms_days: Math.floor(num(v.terms_days, "Payment terms (days)", 0)),
      etransfer_email: v.etransfer_email.trim(),
      etransfer_text: v.etransfer_text,
      website: v.website.trim(),
      sender_name: v.sender_name.trim(),
      email_subject: v.email_subject.trim() || "[{business}] Invoice received",
      accent_color: /^#[0-9a-fA-F]{6}$/.test(v.accent_color.trim()) ? v.accent_color.trim() : "#0a6e48",
      google_client_id: v.google_client_id.trim(),
    };
    // Secrets: a blank field keeps what is stored.
    if (v.stripe_secret_key.trim()) patch.stripe_secret_key = v.stripe_secret_key.trim();
    if (v.google_client_secret.trim()) patch.google_client_secret = v.google_client_secret.trim();
    // Changing the client id invalidates the old refresh token.
    if (patch.google_client_id !== cur.google_client_id && cur.google_refresh_token) {
      patch.google_refresh_token = "";
      patch.google_email = "";
    }
    persistSettings(patch);
    return {};
  });
}

export async function clearStripeKeyAction() {
  return wrap(() => {
    persistSettings({ stripe_secret_key: "" });
    return {};
  });
}

export async function testStripeAction() {
  return wrap(async () => ({ message: await testStripe(), mode: stripeMode() ?? "" }));
}

export async function disconnectGoogleAction() {
  return wrap(() => {
    disconnectGoogle();
    return {};
  });
}

export async function sendTestEmailAction() {
  return wrap(async () => ({ message: await sendTestEmail() }));
}

export async function uploadLogoAction(fd: FormData) {
  return wrap(async () => {
    const f = fd.get("logo");
    if (!(f instanceof File) || f.size === 0) throw new Error("Choose an image file.");
    if (f.size > 2_000_000) throw new Error("Logo must be under 2 MB.");
    const ext = ({ "image/png": "png", "image/jpeg": "jpg" } as Record<string, string>)[f.type];
    if (!ext) throw new Error("Logo must be a PNG or JPEG.");
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, `logo.${ext}`), Buffer.from(await f.arrayBuffer()));
    persistSettings({ logo_ext: ext });
    return {};
  });
}

export async function resetLogoAction() {
  return wrap(() => {
    persistSettings({ logo_ext: "" });
    return {};
  });
}
