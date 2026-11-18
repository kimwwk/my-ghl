import { route, readJson } from "@/lib/api";
import { markPaid } from "@/lib/service";

export const dynamic = "force-dynamic";

export const POST = route(async (req, { id }) => markPaid(id, await readJson(req)));
