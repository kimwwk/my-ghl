import { route, readJson } from "@/lib/api";
import { createClient, listClients, parseClientInput } from "@/lib/clients";

export const dynamic = "force-dynamic";

export const GET = route(async () => ({ clients: listClients() }));

export const POST = route(async (req) => Response.json(createClient(parseClientInput(await readJson(req))), { status: 201 }));
