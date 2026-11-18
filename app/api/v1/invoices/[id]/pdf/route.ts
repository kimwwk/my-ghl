import { route } from "@/lib/api";
import { pdfResponse } from "@/lib/pdf-service";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, { id }) => pdfResponse(id));
