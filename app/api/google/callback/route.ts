import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/settings";
import { completeConnect } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const back = (q: Record<string, string>) => NextResponse.redirect(`${appUrl()}/settings?${new URLSearchParams(q)}`);
  const jar = await cookies();
  const expected = jar.get("g_state")?.value;
  const verifier = jar.get("g_pkce")?.value;
  jar.delete("g_state");
  jar.delete("g_pkce");
  if (sp.get("error")) return back({ google_error: `Google returned: ${sp.get("error")}` });
  if (!expected || sp.get("state") !== expected)
    return back({ google_error: "OAuth state mismatch (possible CSRF or expired attempt). Try Connect Google again." });
  const code = sp.get("code");
  if (!code) return back({ google_error: "No authorization code in the callback." });
  if (!verifier) return back({ google_error: "The sign-in attempt expired. Try Connect Google again." });
  try {
    const email = await completeConnect(code, verifier);
    return back({ google_ok: email || "connected" });
  } catch (e) {
    return back({ google_error: e instanceof Error ? e.message : String(e) });
  }
}
