import { business } from "./settings";
import { logoFile } from "./email";
import { requireInvoice } from "./invoices";
import { renderInvoicePdf } from "./pdf";

export async function invoicePdf(id: string): Promise<{ number: string; buf: Buffer }> {
  const inv = requireInvoice(id);
  return { number: inv.number, buf: await renderInvoicePdf(inv, business(), logoFile()) };
}

export async function pdfResponse(id: string, inline = false): Promise<Response> {
  const { number, buf } = await invoicePdf(id);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${number}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
