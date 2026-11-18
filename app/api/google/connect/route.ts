import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { appUrl } from "@/lib/settings";
import { buildAuthUrl } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = randomBytes(24).toString("base64url");
  let url: string;
  try {
    url = buildAuthUrl(state);
  } catch (e) {
    const q = new URLSearchParams({ google_error: e instanceof Error ? e.message : String(e) });
    return NextResponse.redirect(`${appUrl()}/settings?${q}`);
  }
  (await cookies()).set("g_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(url);
}
