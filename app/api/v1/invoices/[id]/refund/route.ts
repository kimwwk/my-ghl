import { route, readJson } from "@/lib/api";
import { recordRefund } from "@/lib/service";

export const dynamic = "force-dynamic";

export const POST = route(async (req, { id }) => recordRefund(id, await readJson(req)));
