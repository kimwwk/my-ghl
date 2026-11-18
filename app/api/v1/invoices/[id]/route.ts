import { route, readJson } from "@/lib/api";
import { parseInvoiceInput, requireInvoice, updateInvoice } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, { id }) => requireInvoice(id));

export const PATCH = route(async (req, { id }) => updateInvoice(id, parseInvoiceInput(await readJson(req))));
