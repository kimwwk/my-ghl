"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import {
  deleteDraftAction,
  duplicateInvoiceAction,
  markPaidAction,
  saveInvoiceAction,
  sendInvoiceAction,
  syncInvoiceAction,
  voidInvoiceAction,
} from "@/app/actions";
import { renderInvoiceEmail } from "@/lib/email-html";
import {
  type BusinessProfile,
  type Currency,
  type Invoice,
  type PaidMethod,
  centsToInput,
  computeTotals,
  formatDate,
  formatMoney,
  lineAmountCents,
  parseMoneyToCents,
  todayISO,
} from "@/lib/types";

export interface EditorDefaults {
  number: string;
  issue_date: string;
  due_date: string;
  currency: Currency;
  tax: { name: string; rate_percent: number } | null;
  taxDefaultName: string;
  taxDefaultRate: number;
  notes: string;
  etransfer: boolean;
  card: boolean;
}

interface Row {
  description: string;
  quantity: string;
  price: string;
}

const selectCls =
  "h-8 w-full border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="label-mono mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-foreground pt-3">
      <h2 className="pb-3 text-lg font-extrabold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function InvoiceEditor({
  invoice,
  defaults,
  business,
  stripeEnabled,
  sendBlock,
}: {
  invoice: Invoice | null;
  defaults: EditorDefaults;
  business: BusinessProfile;
  stripeEnabled: boolean;
  /** reason the Send button is disabled, or null */
  sendBlock: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const locked = !!invoice && invoice.status !== "draft";

  const [number, setNumber] = useState(invoice?.number ?? defaults.number);
  const [issue, setIssue] = useState(invoice?.issue_date ?? defaults.issue_date);
  const [due, setDue] = useState(invoice?.due_date ?? defaults.due_date);
  const [currency, setCurrency] = useState<Currency>(invoice?.currency ?? defaults.currency);
  const [name, setName] = useState(invoice?.bill_to.name ?? "");
  const [company, setCompany] = useState(invoice?.bill_to.company ?? "");
  const [email, setEmail] = useState(invoice?.bill_to.email ?? "");
  const [cc, setCc] = useState((invoice?.bill_to.cc ?? []).join(", "));
  const [address, setAddress] = useState(invoice?.bill_to.address ?? "");
  const [rows, setRows] = useState<Row[]>(
    invoice?.items.length
      ? invoice.items.map((i) => ({ description: i.description, quantity: String(i.quantity), price: centsToInput(i.unit_price_cents) }))
      : [{ description: "", quantity: "1", price: "" }],
  );
  const initTax = invoice ? invoice.tax : defaults.tax;
  const [taxOn, setTaxOn] = useState(!!initTax);
  const [taxName, setTaxName] = useState(initTax?.name ?? defaults.taxDefaultName);
  const [taxRate, setTaxRate] = useState(String(initTax?.rate_percent ?? defaults.taxDefaultRate));
  const [notes, setNotes] = useState(invoice?.notes ?? defaults.notes);
  const [message, setMessage] = useState(invoice?.message ?? "");
  const [payEt, setPayEt] = useState(invoice?.payment.etransfer ?? defaults.etransfer);
  const [payCard, setPayCard] = useState(stripeEnabled ? (invoice?.payment.card ?? defaults.card) : false);

  const [showPaid, setShowPaid] = useState(false);
  const [paidMethod, setPaidMethod] = useState<PaidMethod>("etransfer");
  const [paidDate, setPaidDate] = useState(todayISO());
  const [paidNote, setPaidNote] = useState("");
  const [overrideTo, setOverrideTo] = useState("");

  const items = rows.map((r) => ({
    description: r.description,
    quantity: Number(r.quantity) || 0,
    unit_price_cents: parseMoneyToCents(r.price),
  }));
  const rowErr = items.some((i) => Number.isNaN(i.unit_price_cents));
  const cleanItems = items
    .filter((i) => i.description.trim() || i.unit_price_cents)
    .map((i) => ({ ...i, unit_price_cents: Number.isNaN(i.unit_price_cents) ? 0 : i.unit_price_cents }));
  const tax = taxOn ? { name: taxName.trim() || "Tax", rate_percent: Number(taxRate) || 0 } : null;
  const totals = computeTotals(cleanItems, tax);
  const ccList = cc.split(/[,;\s]+/).filter(Boolean);

  const preview = renderInvoiceEmail({
        invoice: {
          number,
          currency,
          issue_date: issue,
          due_date: due,
          bill_to: { name, company, email, cc: ccList, address },
          items: cleanItems,
          tax,
          ...totals,
          notes,
          message,
          payment: { etransfer: payEt, card: payCard },
        },
        business,
        logoSrc: "/api/logo",
        payUrl: invoice?.stripe.url ?? null,
  }).html;

  function buildInput() {
    return {
      number,
      currency,
      issue_date: issue,
      due_date: due,
      bill_to: { name, company, email, cc: ccList, address },
      items: cleanItems,
      tax,
      notes,
      message,
      payment: { etransfer: payEt, card: payCard },
    };
  }

  async function save(): Promise<string | null> {
    if (rowErr) {
      toast.error("A unit price is not a valid amount.");
      return null;
    }
    const r = await saveInvoiceAction(invoice?.id ?? null, buildInput());
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }
    return r.id;
  }

  const onSave = () =>
    start(async () => {
      const id = await save();
      if (!id) return;
      toast.success("Draft saved");
      if (!invoice) router.replace(`/invoices/${id}`);
      else router.refresh();
    });

  const onSend = (resend = false) =>
    start(async () => {
      const target = overrideTo.trim() || email.trim();
      if (!window.confirm(`${resend ? "Resend" : "Send"} ${number} (${formatMoney(totals.total_cents, currency)}) to ${target || "(no email)"}?`)) return;
      let id = invoice?.id ?? null;
      if (!locked) {
        id = await save();
        if (!id) return;
      }
      const r = await sendInvoiceAction(id!, overrideTo.trim() || undefined);
      if (!r.ok) {
        toast.error(r.error);
        if (!invoice) router.replace(`/invoices/${id}`);
        else router.refresh();
        return;
      }
      toast.success(`Sent to ${r.to}`);
      router.replace(`/invoices/${id}`);
      router.refresh();
    });

  const run = (fn: () => Promise<void>) => start(fn);

  const act = {
    duplicate: () =>
      run(async () => {
        const r = await duplicateInvoiceAction(invoice!.id);
        if (r.ok) {
          toast.success("Duplicated as a new draft");
          router.push(`/invoices/${r.id}`);
        } else toast.error(r.error);
      }),
    void: () =>
      run(async () => {
        if (!window.confirm(`Void ${invoice!.number}? This also deactivates its card payment link.`)) return;
        const r = await voidInvoiceAction(invoice!.id);
        if (r.ok) {
          if (r.warning) toast.warning(r.warning);
          else toast.success("Invoice voided");
          router.refresh();
        } else toast.error(r.error);
      }),
    del: () =>
      run(async () => {
        if (!window.confirm(`Delete draft ${invoice!.number}?`)) return;
        const r = await deleteDraftAction(invoice!.id);
        if (r.ok) router.push("/");
        else toast.error(r.error);
      }),
    paid: () =>
      run(async () => {
        const r = await markPaidAction(invoice!.id, paidMethod, paidDate, paidNote);
        if (r.ok) {
          toast.success("Marked as paid");
          setShowPaid(false);
          router.refresh();
        } else toast.error(r.error);
      }),
    sync: () =>
      run(async () => {
        const r = await syncInvoiceAction(invoice!.id);
        if (r.ok) {
          toast.message(r.note);
          router.refresh();
        } else toast.error(r.error);
      }),
    copy: async () => {
      try {
        await navigator.clipboard.writeText(invoice!.stripe.url!);
        toast.success("Payment link copied");
      } catch {
        toast.error("Could not copy the link.");
      }
    },
  };

  const status = invoice?.status;
  const hasLink = !!invoice?.stripe.url;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-mono">{invoice ? "Invoice" : "New invoice"}</p>
          <div className="flex items-center gap-3 pt-1">
            <h1 className="font-mono text-3xl font-medium">{number || "—"}</h1>
            {invoice && <StatusBadge status={invoice.display_status} />}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!locked && (
            <>
              <Button variant="outline" onClick={onSave} disabled={pending}>
                Save draft
              </Button>
              <Button onClick={() => onSend(false)} disabled={pending || !!sendBlock} title={sendBlock ?? undefined}>
                Send
              </Button>
            </>
          )}
          {status === "sent" && (
            <>
              <Button onClick={() => setShowPaid((v) => !v)} variant={showPaid ? "secondary" : "default"} disabled={pending}>
                Mark as paid
              </Button>
              <Button variant="outline" onClick={() => onSend(true)} disabled={pending || !!sendBlock} title={sendBlock ?? undefined}>
                Resend
              </Button>
              {hasLink && (
                <Button variant="outline" onClick={act.sync} disabled={pending}>
                  Sync Stripe
                </Button>
              )}
            </>
          )}
          {invoice && (
            <Button variant="outline" onClick={act.duplicate} disabled={pending}>
              Duplicate
            </Button>
          )}
          {hasLink && invoice!.stripe.active && (
            <Button variant="outline" onClick={act.copy}>
              <Copy /> Copy payment link
            </Button>
          )}
          {(status === "sent" || status === "draft") && invoice && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={status === "draft" ? act.del : act.void}
              disabled={pending}
            >
              {status === "draft" ? "Delete draft" : "Void"}
            </Button>
          )}
        </div>
      </div>

      {!locked && sendBlock && (
        <p className="mt-3 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Send is disabled: {sendBlock}
        </p>
      )}
      {locked && (
        <p className="mt-3 border-l-2 border-primary bg-secondary px-3 py-2 text-sm text-inkdeep">
          {status === "sent" && "This invoice has been sent and is locked. To change it, void it and duplicate it into a new draft."}
          {status === "paid" && `Paid on ${formatDate(invoice!.paid!.at)} by ${invoice!.paid!.method}${invoice!.paid!.note ? ` (${invoice!.paid!.note})` : ""}. Locked.`}
          {status === "void" && "This invoice is void. Duplicate it to start a new draft."}
        </p>
      )}

      {showPaid && status === "sent" && (
        <div className="mt-4 grid gap-4 border border-border bg-card p-4 sm:grid-cols-4">
          <Field label="Method">
            <select className={selectCls} value={paidMethod} onChange={(e) => setPaidMethod(e.target.value as PaidMethod)}>
              <option value="etransfer">e-Transfer</option>
              <option value="card">Card</option>
              <option value="eft">EFT</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Date received">
            <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </Field>
          <Field label="Note" className="sm:col-span-2">
            <Input value={paidNote} onChange={(e) => setPaidNote(e.target.value)} placeholder="Optional, e.g. e-Transfer reference" />
          </Field>
          <div className="sm:col-span-4">
            <Button onClick={act.paid} disabled={pending}>
              Confirm payment
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <fieldset disabled={locked} className="min-w-0 space-y-8">
          <Section title="Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Invoice number">
                <Input value={number} onChange={(e) => setNumber(e.target.value)} className="font-mono" />
              </Field>
              <Field label="Currency">
                <select className={selectCls} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                  <option value="CAD">CAD</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label="Issue date">
                <Input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} />
              </Field>
              <Field label="Due date">
                <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Bill to">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client name">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Company (optional)">
                <Input value={company} onChange={(e) => setCompany(e.target.value)} />
              </Field>
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="CC (optional, comma separated)">
                <Input value={cc} onChange={(e) => setCc(e.target.value)} />
              </Field>
            </div>
            <Field label="Address">
              <Textarea rows={3} value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
          </Section>

          <Section title="Line items">
            <div className="space-y-3">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[70px_1fr_1fr_32px] items-center gap-2 border-b border-border pb-3">
                  <Input
                    className="col-span-4"
                    placeholder="Description"
                    value={r.description}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                  />
                  <Input
                    inputMode="decimal"
                    placeholder="Qty"
                    value={r.quantity}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                  />
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={r.price}
                    aria-invalid={Number.isNaN(parseMoneyToCents(r.price))}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                  />
                  <div className="truncate text-right font-mono text-sm">
                    {formatMoney(lineAmountCents(items[i]) || 0, currency)}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove line"
                    onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ description: "", quantity: "1", price: "" }])}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, { description: "", quantity: "1", price: "" }])}>
                <Plus /> Add line
              </Button>
            </div>

            <div className="ml-auto max-w-sm space-y-2 border-t border-border pt-3 text-sm">
              <div className="flex items-center gap-2">
                <input id="taxon" type="checkbox" className="size-4 accent-[#0a6e48]" checked={taxOn} onChange={(e) => setTaxOn(e.target.checked)} />
                <Label htmlFor="taxon">Add tax</Label>
                {taxOn && (
                  <>
                    <Input className="h-7 w-24" value={taxName} onChange={(e) => setTaxName(e.target.value)} aria-label="Tax name" />
                    <Input className="h-7 w-16" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} aria-label="Tax rate percent" />
                    <span className="text-muted-foreground">%</span>
                  </>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{formatMoney(totals.subtotal_cents, currency)}</span>
              </div>
              {tax && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {tax.name} {tax.rate_percent}%
                  </span>
                  <span className="font-mono">{formatMoney(totals.tax_cents, currency)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-foreground pt-2 text-base font-bold">
                <span>Total</span>
                <span className="font-mono">{formatMoney(totals.total_cents, currency)}</span>
              </div>
            </div>
          </Section>

          <Section title="Payment options">
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 size-4 accent-[#0a6e48]" checked={payEt} onChange={(e) => setPayEt(e.target.checked)} />
              <span>
                <span className="font-medium">Interac e-Transfer</span>
                <span className="block text-sm text-muted-foreground">
                  {business.etransfer_email ? `Instructions from Settings (${business.etransfer_email}).` : "Set the e-Transfer address in Settings first."}
                </span>
              </span>
            </label>
            {stripeEnabled ? (
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 size-4 accent-[#0a6e48]" checked={payCard} onChange={(e) => setPayCard(e.target.checked)} />
                <span>
                  <span className="font-medium">Pay by card (Stripe)</span>
                  <span className="block text-sm text-muted-foreground">A single-use Stripe Payment Link is created when you send.</span>
                </span>
              </label>
            ) : (
              <p className="text-sm text-caption">Card payments are hidden: no Stripe key is configured (Settings &gt; Stripe).</p>
            )}
          </Section>

          <Section title="Message and terms">
            <Field label="Custom email message (optional)">
              <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Shown under the greeting in the email." />
            </Field>
            <Field label="Notes / terms">
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </Section>
        </fieldset>

        <div className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="flex items-baseline justify-between">
            <p className="label-mono">Live email preview</p>
            <p className="text-xs text-caption">Subject: Invoice {number} from {business.display_name}</p>
          </div>
          <iframe title="Email preview" sandbox="" srcDoc={preview} className="h-[760px] w-full border border-border bg-background xl:h-[calc(100vh-9rem)]" />

          {invoice && !locked && (
            <Field label="Override recipient for this send (optional)">
              <Input value={overrideTo} onChange={(e) => setOverrideTo(e.target.value)} placeholder={email || "client@example.com"} />
            </Field>
          )}
          {invoice && invoice.sends.length > 0 && (
            <div className="border border-border bg-card p-4">
              <p className="label-mono pb-2">Send log</p>
              <ul className="space-y-2 text-sm">
                {invoice.sends.map((s, i) => (
                  <li key={i} className="border-b border-border pb-2 last:border-0 last:pb-0">
                    <span className="font-mono text-xs text-caption">{new Date(s.sent_at).toLocaleString("en-CA")}</span>
                    <div>
                      To {s.to.join(", ")}
                      {s.cc.length > 0 && <> &middot; CC {s.cc.join(", ")}</>}
                    </div>
                    <div className="font-mono text-xs text-caption">
                      {s.transport === "file" ? "file" : "Gmail"} id {s.message_id}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasLink && (
            <p className="break-all font-mono text-xs text-caption">
              Stripe link ({invoice!.stripe.active ? "active" : "inactive"}): {invoice!.stripe.url}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
