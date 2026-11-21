import { SettingsForm } from "@/components/settings-form";
import { emailMode, getSettings, googleCreds, mask, stripeKey } from "@/lib/settings";
import { redirectUri } from "@/lib/google";
import { stripeMode } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google_ok?: string; google_error?: string }>;
}) {
  const sp = await searchParams;
  const s = getSettings();
  const g = googleCreds(s);
  const key = stripeKey(s);
  return (
    <SettingsForm
      initial={{
        business_name: s.business_name,
        legal_name: s.legal_name,
        address: s.address,
        email: s.email,
        phone: s.phone,
        tax_number: s.tax_number,
        invoice_prefix: s.invoice_prefix,
        next_number: s.next_number,
        default_currency: s.default_currency,
        default_tax_enabled: s.default_tax_enabled,
        default_tax_name: s.default_tax_name,
        default_tax_rate: s.default_tax_rate,
        default_notes: s.default_notes,
        terms_days: s.terms_days,
        etransfer_email: s.etransfer_email,
        etransfer_text: s.etransfer_text,
        website: s.website,
        sender_name: s.sender_name,
        email_subject: s.email_subject,
        accent_color: s.accent_color,
        google_client_id: g.clientId,
      }}
      stripe={{
        saved: !!s.stripe_secret_key,
        fromEnv: !s.stripe_secret_key && !!process.env.STRIPE_SECRET_KEY,
        masked: mask(key),
        mode: stripeMode(key),
      }}
      google={{
        redirectUri: redirectUri(),
        hasSecret: !!g.clientSecret,
        connectedEmail: s.google_refresh_token ? s.google_email || "(connected)" : null,
        flash: sp.google_ok ? { ok: true, text: `Connected ${sp.google_ok}` } : sp.google_error ? { ok: false, text: sp.google_error } : null,
        fileMode: emailMode() === "file",
      }}
      customLogo={!!s.logo_ext}
    />
  );
}
