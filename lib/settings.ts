import { db } from "./db";
import type { BusinessProfile, Currency } from "./types";

export interface Settings {
  business_name: string;
  legal_name: string;
  address: string;
  email: string;
  phone: string;
  tax_number: string;
  invoice_prefix: string;
  next_number: number;
  default_currency: Currency;
  default_tax_enabled: boolean;
  default_tax_name: string;
  default_tax_rate: number;
  default_notes: string;
  terms_days: number;
  etransfer_email: string;
  etransfer_text: string;
  stripe_secret_key: string;
  google_client_id: string;
  google_client_secret: string;
  google_refresh_token: string;
  google_email: string;
  logo_ext: string; // "" = bundled default logo
}

export const DEFAULTS: Settings = {
  business_name: "Kivov Digital",
  legal_name: "",
  address: "",
  email: "",
  phone: "",
  tax_number: "",
  invoice_prefix: "INV-",
  next_number: 1,
  default_currency: "CAD",
  default_tax_enabled: false,
  default_tax_name: "HST",
  default_tax_rate: 13,
  default_notes: "Payment is due by the due date shown above. Thank you for your business.",
  terms_days: 14,
  etransfer_email: "",
  etransfer_text:
    "Send an Interac e-Transfer to {email} and put the invoice number ({invoice}) in the message.",
  stripe_secret_key: "",
  google_client_id: "",
  google_client_secret: "",
  google_refresh_token: "",
  google_email: "",
  logo_ext: "",
};

export function getSettings(): Settings {
  const rows = db().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const r of rows) {
    if (!(r.key in DEFAULTS)) continue;
    const def = (DEFAULTS as unknown as Record<string, unknown>)[r.key];
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = def;
    }
    if (typeof out[r.key] !== typeof def) out[r.key] = def;
  }
  return out as unknown as Settings;
}

export function saveSettings(patch: Partial<Settings>) {
  const stmt = db().prepare(
    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  const tx = db().transaction(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in DEFAULTS) || v === undefined) continue;
      stmt.run(k, JSON.stringify(v));
    }
  });
  tx();
}

export function stripeKey(s: Settings = getSettings()): string {
  return (s.stripe_secret_key || process.env.STRIPE_SECRET_KEY || "").trim();
}

export function googleCreds(s: Settings = getSettings()) {
  return {
    clientId: (s.google_client_id || process.env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: (s.google_client_secret || process.env.GOOGLE_CLIENT_SECRET || "").trim(),
  };
}

export function emailMode(): "file" | "gmail" {
  return process.env.EMAIL_TRANSPORT === "file" ? "file" : "gmail";
}

export function business(s: Settings = getSettings()): BusinessProfile {
  return {
    display_name: s.business_name,
    legal_name: s.legal_name,
    address: s.address,
    email: s.email,
    phone: s.phone,
    tax_number: s.tax_number,
    etransfer_email: s.etransfer_email,
    etransfer_text: s.etransfer_text,
  };
}

export function mask(secret: string): string {
  if (!secret) return "";
  return `${secret.slice(0, 7)}••••••••${secret.slice(-4)}`;
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:8796").replace(/\/$/, "");
}
