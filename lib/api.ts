import { timingSafeEqual } from "node:crypto";
import { ApiError } from "./invoices";

export function authorize(req: Request) {
  const token = process.env.INVOICE_API_TOKEN;
  if (!token) throw new ApiError(503, "INVOICE_API_TOKEN is not set on the server. Add it to .env.local and restart.");
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) throw new ApiError(401, "Missing bearer token. Send `Authorization: Bearer <INVOICE_API_TOKEN>`.");
  const a = Buffer.from(m[1]);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError(401, "Invalid API token.");
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text);
    if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
    return v as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "Request body must be a JSON object.");
  }
}

type Ctx = { params: Promise<{ id?: string }> };

export function route(
  fn: (req: Request, ctx: { id: string }) => Promise<Response | unknown> | Response | unknown,
) {
  return async (req: Request, ctx: Ctx) => {
    try {
      authorize(req);
      const id = (await ctx?.params)?.id ?? "";
      const out = await fn(req, { id });
      if (out instanceof Response) return out;
      return Response.json(out);
    } catch (e) {
      if (e instanceof ApiError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
    }
  };
}
