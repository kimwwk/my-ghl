import { route, readJson } from "@/lib/api";
import { createInvoice, listInvoices, parseInvoiceInput } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  return { invoices: listInvoices(status) };
});

export const POST = route(async (req) => {
  const body = await readJson(req);
  const input = parseInvoiceInput(body);
  const inv = createInvoice(input);
  return Response.json(inv, { status: 201 });
});
