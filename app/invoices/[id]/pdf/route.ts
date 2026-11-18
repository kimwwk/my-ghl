import { getInvoice } from "@/lib/invoices";
import { pdfResponse } from "@/lib/pdf-service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getInvoice(id)) return new Response("Not found", { status: 404 });
  return pdfResponse(id);
}
