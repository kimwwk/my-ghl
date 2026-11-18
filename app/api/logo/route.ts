import { logoFile } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET() {
  const l = logoFile();
  return new Response(new Uint8Array(l.buf), { headers: { "content-type": l.contentType, "cache-control": "no-store" } });
}
