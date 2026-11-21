"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  clearStripeKeyAction,
  disconnectGoogleAction,
  resetLogoAction,
  saveSettingsAction,
  sendTestEmailAction,
  testStripeAction,
  uploadLogoAction,
  type SettingsInput,
} from "@/app/actions";

type Initial = Omit<SettingsInput, "stripe_secret_key" | "google_client_secret">;

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="label-mono mb-1.5 block">{label}</Label>
      {children}
      {hint && <p className="pt-1 text-xs text-caption">{hint}</p>}
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-foreground pt-3">
      <h2 className="text-xl font-extrabold">{title}</h2>
      {desc && <p className="pt-1 pb-1 text-sm text-muted-foreground">{desc}</p>}
      <div className="space-y-4 pt-3">{children}</div>
    </section>
  );
}

const selectCls = "h-8 w-full border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function SettingsForm({
  initial,
  stripe,
  google,
  customLogo,
}: {
  initial: Initial;
  stripe: { saved: boolean; fromEnv: boolean; masked: string; mode: "test" | "live" | null };
  google: {
    redirectUri: string;
    hasSecret: boolean;
    connectedEmail: string | null;
    flash: { ok: boolean; text: string } | null;
    fileMode: boolean;
  };
  customLogo: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<Initial>(initial);
  const [stripeKey, setStripeKey] = useState("");
  const [gSecret, setGSecret] = useState("");
  const set = <K extends keyof Initial>(k: K, val: Initial[K]) => setV((p) => ({ ...p, [k]: val }));
  const full = (): SettingsInput => ({ ...v, stripe_secret_key: stripeKey, google_client_secret: gSecret });

  const save = (quiet = false) =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        const r = await saveSettingsAction(full());
        if (!r.ok) toast.error(r.error);
        else {
          if (!quiet) toast.success("Settings saved");
          setStripeKey("");
          setGSecret("");
          router.refresh();
        }
        resolve(r.ok);
      }),
    );

  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const googleReady = !!v.google_client_id && (google.hasSecret || !!gSecret);

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <p className="label-mono">Kivov Digital</p>
      <h1 className="pt-1 text-3xl font-black">Settings</h1>

      <div className="mt-8 space-y-10">
        <Card title="Business profile" desc="Appears in the From block and footer of every invoice email.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name"><Input value={v.business_name} onChange={(e) => set("business_name", e.target.value)} /></Field>
            <Field label="Legal name"><Input value={v.legal_name} onChange={(e) => set("legal_name", e.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Phone"><Input value={v.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Tax / HST number (optional)"><Input value={v.tax_number} onChange={(e) => set("tax_number", e.target.value)} /></Field>
            <Field label="Website (optional)"><Input value={v.website} onChange={(e) => set("website", e.target.value)} /></Field>
            <Field label="Email sender name" hint="Signs the invoice email: Regards, <name>."><Input value={v.sender_name} onChange={(e) => set("sender_name", e.target.value)} /></Field>
            <Field label="Email subject" hint="Subject of every invoice email. {invoice} adds the invoice number; {business} adds the display name."><Input value={v.email_subject} onChange={(e) => set("email_subject", e.target.value)} /></Field>
            <Field label="Accent colour" hint="Pay button and the line-items header rule.">
              <div className="flex gap-2">
                <input type="color" aria-label="Accent colour" value={/^#[0-9a-fA-F]{6}$/.test(v.accent_color) ? v.accent_color : "#0a6e48"} onChange={(e) => set("accent_color", e.target.value)} className="h-8 w-10 border border-input bg-transparent p-0.5" />
                <Input value={v.accent_color} onChange={(e) => set("accent_color", e.target.value)} className="font-mono" />
              </div>
            </Field>
          </div>
          <Field label="Address"><Textarea rows={3} value={v.address} onChange={(e) => set("address", e.target.value)} /></Field>
          <div className="flex flex-wrap items-center gap-4 border border-border bg-card p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/logo?v=${customLogo ? "c" : "d"}`} alt="Logo" className="h-10 w-auto" />
            <form
              action={(fd) => start(async () => { const r = await uploadLogoAction(fd); if (r.ok) { toast.success("Logo updated"); router.refresh(); } else toast.error(r.error); })}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="file" name="logo" accept="image/png,image/jpeg" className="text-sm" />
              <Button type="submit" size="sm" variant="outline" disabled={pending}>Upload logo</Button>
            </form>
            {customLogo && (
              <Button size="sm" variant="ghost" onClick={() => start(async () => { await resetLogoAction(); router.refresh(); })}>Use default</Button>
            )}
          </div>
        </Card>

        <Card title="Invoice defaults">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Prefix"><Input value={v.invoice_prefix} onChange={(e) => set("invoice_prefix", e.target.value)} className="font-mono" /></Field>
            <Field label="Next number"><Input inputMode="numeric" value={v.next_number} onChange={(e) => set("next_number", e.target.value)} className="font-mono" /></Field>
            <Field label="Currency">
              <select className={selectCls} value={v.default_currency} onChange={(e) => set("default_currency", e.target.value as "CAD" | "USD")}>
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
              </select>
            </Field>
            <Field label="Payment terms (days)"><Input inputMode="numeric" value={v.terms_days} onChange={(e) => set("terms_days", e.target.value)} /></Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input id="dt" type="checkbox" className="size-4 accent-[#0a6e48]" checked={v.default_tax_enabled} onChange={(e) => set("default_tax_enabled", e.target.checked)} />
            <Label htmlFor="dt">Add tax to new invoices by default</Label>
            <Input className="w-28" value={v.default_tax_name} onChange={(e) => set("default_tax_name", e.target.value)} aria-label="Default tax name" />
            <Input className="w-20" inputMode="decimal" value={v.default_tax_rate} onChange={(e) => set("default_tax_rate", e.target.value)} aria-label="Default tax rate" />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          <Field label="Default notes / terms"><Textarea rows={3} value={v.default_notes} onChange={(e) => set("default_notes", e.target.value)} /></Field>
        </Card>

        <Card title="Interac e-Transfer">
          <Field label="Recipient email"><Input type="email" value={v.etransfer_email} onChange={(e) => set("etransfer_email", e.target.value)} /></Field>
          <Field label="Instruction text" hint="Use {email} for the recipient and {invoice} for the invoice number.">
            <Textarea rows={3} value={v.etransfer_text} onChange={(e) => set("etransfer_text", e.target.value)} />
          </Field>
        </Card>

        <Card title="Stripe (card payments)" desc="Optional. Without a key the card option is hidden everywhere.">
          <div className="flex flex-wrap items-center gap-3">
            {stripe.mode ? (
              <span className={`border px-2 py-0.5 font-mono text-[11px] tracking-wider uppercase ${stripe.mode === "live" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground"}`}>
                {stripe.mode} mode
              </span>
            ) : (
              <span className="border border-border px-2 py-0.5 font-mono text-[11px] tracking-wider text-caption uppercase">not configured</span>
            )}
            {stripe.masked && (
              <span className="font-mono text-sm text-muted-foreground">
                {stripe.masked}
                {stripe.fromEnv && " (from STRIPE_SECRET_KEY env)"}
              </span>
            )}
          </div>
          <Field label="Secret key" hint={stripe.saved ? "A key is saved. Leave blank to keep it, or paste a new one to replace it." : "sk_test_... or sk_live_... (a restricted key needs Payment Links, Prices and Checkout Sessions read/write)."}>
            <Input type="password" autoComplete="off" value={stripeKey} onChange={(e) => setStripeKey(e.target.value)} placeholder={stripe.saved ? "Saved" : "sk_test_..."} className="font-mono" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  if (stripeKey.trim()) {
                    const r = await saveSettingsAction(full());
                    if (!r.ok) return void toast.error(r.error);
                    setStripeKey("");
                  }
                  const r = await testStripeAction();
                  if (r.ok) toast.success(r.message);
                  else toast.error(r.error);
                  router.refresh();
                })
              }
            >
              Test connection
            </Button>
            {stripe.saved && (
              <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await clearStripeKeyAction(); router.refresh(); })}>
                Remove saved key
              </Button>
            )}
          </div>
        </Card>

        <Card title="Email (Gmail)" desc="Invoices are sent through the Gmail API as the connected Google account.">
          {google.fileMode && (
            <p className="border-l-2 border-primary bg-secondary px-3 py-2 text-sm text-inkdeep">
              EMAIL_TRANSPORT=file: emails are written to data/outbox/ as .eml files instead of being sent.
            </p>
          )}
          {google.flash && (
            <p className={`border-l-2 px-3 py-2 text-sm ${google.flash.ok ? "border-primary bg-secondary text-inkdeep" : "border-destructive bg-destructive/5 text-destructive"}`}>
              {google.flash.text}
            </p>
          )}
          {google.connectedEmail ? (
            <div className="flex flex-wrap items-center gap-3 border border-border bg-card p-3">
              <span className="font-mono text-sm">Connected: {google.connectedEmail}</span>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await sendTestEmailAction(); if (r.ok) toast.success(r.message); else toast.error(r.error); })}>
                Send test email
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await disconnectGoogleAction(); toast.success("Disconnected"); router.refresh(); })}>
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={pending || !googleReady}
                title={googleReady ? undefined : "Enter and save the Google client ID and secret first"}
                onClick={async () => { if (await save(true)) window.open("/api/google/connect", "_self"); }}
              >
                Connect Google
              </Button>
              {google.fileMode && (
                <Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await sendTestEmailAction(); if (r.ok) toast.success(r.message); else toast.error(r.error); })}>
                  Send test email (file)
                </Button>
              )}
              {!googleReady && <span className="text-sm text-caption">Not connected. Fill in the client ID and secret below, then connect.</span>}
            </div>
          )}

          <Field label="OAuth redirect URI (only for a Web application client; a Desktop app client needs nothing)">
            <div className="flex gap-2">
              <Input readOnly value={google.redirectUri} className="font-mono" />
              <Button variant="outline" size="icon" aria-label="Copy redirect URI" onClick={() => copy(google.redirectUri)}><Copy /></Button>
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Google client ID"><Input value={v.google_client_id} onChange={(e) => set("google_client_id", e.target.value)} className="font-mono" autoComplete="off" /></Field>
            <Field label="Google client secret" hint={google.hasSecret ? "Saved. Leave blank to keep it." : undefined}>
              <Input type="password" autoComplete="off" value={gSecret} onChange={(e) => setGSecret(e.target.value)} placeholder={google.hasSecret ? "Saved" : ""} className="font-mono" />
            </Field>
          </div>

          {!google.connectedEmail && (
            <details className="border border-border bg-card p-4 text-sm" open={!googleReady}>
              <summary className="cursor-pointer font-semibold">Setup checklist</summary>
              <ol className="list-decimal space-y-1.5 pt-3 pl-5 text-muted-foreground">
                <li>In Google Cloud Console, create or pick a project and enable the <b>Gmail API</b>.</li>
                <li>Configure the OAuth consent screen and add the scope <span className="font-mono">gmail.send</span>.</li>
                <li>
                  Create an <b>OAuth client ID</b> of type &ldquo;Desktop app&rdquo; (nothing else to set up). A
                  &ldquo;Web application&rdquo; client also works if you add the redirect URI shown above.
                </li>
                <li>If the consent screen is External and in Testing, add the Google account you will send from as a <b>Test user</b>.</li>
                <li>Paste the client ID and secret here, press Save, then Connect Google.</li>
                <li>
                  A consent screen left in <b>Testing</b> issues refresh tokens that expire after 7 days. Publish it to
                  &ldquo;In production&rdquo;, or use an Internal app on a Google Workspace domain.
                </li>
              </ol>
            </details>
          )}
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:left-56">
        <div className="mx-auto flex max-w-3xl justify-end md:px-4">
          <Button onClick={() => save()} disabled={pending}>Save settings</Button>
        </div>
      </div>
    </div>
  );
}
