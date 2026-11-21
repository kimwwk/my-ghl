import { route, readJson } from "@/lib/api";
import { deleteClient, parseClientInput, requireClient, updateClient } from "@/lib/clients";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, { id }) => requireClient(id));

export const PATCH = route(async (req, { id }) => {
  const cur = requireClient(id);
  const body = await readJson(req);
  return updateClient(id, parseClientInput({ name: cur.name, company: cur.company, email: cur.email, cc: cur.cc, address: cur.address, ...body }));
});

export const DELETE = route(async (_req, { id }) => {
  deleteClient(id);
  return { deleted: id };
});
