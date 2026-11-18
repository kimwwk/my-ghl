import { getInvoice } from "@/lib/invoices";
import { previewHtml } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getInvoice(id)) return new Response("Not found", { status: 404 });
  return new Response(previewHtml(id), { headers: { "content-type": "text/html; charset=utf-8" } });
}
