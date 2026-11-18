import { route } from "@/lib/api";
import { syncInvoice } from "@/lib/service";

export const dynamic = "force-dynamic";

export const POST = route(async (_req, { id }) => {
  const r = await syncInvoice(id);
  return { ...r.invoice, sync: { paid: r.paid, note: r.note } };
});
