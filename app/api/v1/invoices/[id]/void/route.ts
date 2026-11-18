import { route } from "@/lib/api";
import { voidInvoice } from "@/lib/service";

export const dynamic = "force-dynamic";

export const POST = route(async (_req, { id }) => {
  const r = await voidInvoice(id);
  return r.warning ? { ...r.invoice, warning: r.warning } : r.invoice;
});
