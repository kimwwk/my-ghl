import { route } from "@/lib/api";
import { previewHtml } from "@/lib/service";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, { id }) => {
  return new Response(previewHtml(id), { headers: { "content-type": "text/html; charset=utf-8" } });
});
