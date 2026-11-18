import { business, getSettings, stripeKey } from "./settings";
import { transportReady } from "./email";
import { nextInvoiceNumber } from "./invoices";
import { addDaysISO, todayISO } from "./types";
import type { EditorDefaults } from "@/components/invoice-editor";

export function editorProps() {
  const s = getSettings();
  const today = todayISO();
  const stripeEnabled = !!stripeKey(s);
  const defaults: EditorDefaults = {
    number: nextInvoiceNumber(),
    issue_date: today,
    due_date: addDaysISO(today, s.terms_days),
    currency: s.default_currency,
    tax: s.default_tax_enabled ? { name: s.default_tax_name, rate_percent: s.default_tax_rate } : null,
    taxDefaultName: s.default_tax_name,
    taxDefaultRate: s.default_tax_rate,
    notes: s.default_notes,
    etransfer: !!(s.etransfer_email || s.etransfer_text),
    card: stripeEnabled,
  };
  const ready = transportReady();
  return { defaults, business: business(s), stripeEnabled, sendBlock: ready.ok ? null : (ready.reason ?? "Email is not set up.") };
}
