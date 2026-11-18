import { route } from "@/lib/api";
import { duplicateInvoice } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export const POST = route(async (_req, { id }) => Response.json(duplicateInvoice(id), { status: 201 }));
