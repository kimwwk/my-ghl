import { route, readJson } from "@/lib/api";
import { sendInvoice } from "@/lib/service";

export const dynamic = "force-dynamic";

export const POST = route(async (req, { id }) => {
  const body = await readJson(req);
  return sendInvoice(id, { to: body.to, cc: body.cc });
});
