import fs from "node:fs";
import { getInvoice } from "@/lib/invoices";
import { originalPdfPath } from "@/lib/originals";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const inv = getInvoice(id);
  const p = inv ? originalPdfPath(inv.number) : null;
  if (!inv || !p) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(p)), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${inv.number}-original.pdf"`,
    },
  });
}
