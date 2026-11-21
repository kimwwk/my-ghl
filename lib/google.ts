// Minimal Google OAuth 2.0 + Gmail send, using plain fetch.
// Works with a "Desktop app" client (Google accepts any loopback redirect, so nothing to register)
// or a "Web application" client with the redirect URI from Settings. PKCE (S256) is always used.
import { createHash, randomBytes } from "node:crypto";
import { appUrl, getSettings, googleCreds, saveSettings } from "./settings";

export const GOOGLE_SCOPES = "openid email https://www.googleapis.com/auth/gmail.send";
export const redirectUri = () => `${appUrl()}/api/google/callback`;

export function newPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthUrl(state: string, codeChallenge: string): string {
  const { clientId } = googleCreds();
  if (!clientId) throw new Error("Google client ID is not set. Save it in Settings first.");
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = googleCreds();
  if (!clientId || !clientSecret) throw new Error("Google client ID/secret are not set in Settings.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || json.error) {
    const detail = json.error_description || json.error || `HTTP ${res.status}`;
    if (json.error === "invalid_grant" && body.grant_type === "refresh_token")
      throw new Error(
        "Google rejected the stored refresh token (invalid_grant). It was revoked or expired (consent screens left in 'Testing' expire after 7 days). Reconnect Google in Settings.",
      );
    throw new Error(`Google token request failed: ${detail}`);
  }
  return json;
}

function emailFromIdToken(idToken?: string): string {
  if (!idToken) return "";
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : "";
  } catch {
    return "";
  }
}

export async function completeConnect(code: string, codeVerifier: string): Promise<string> {
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri(),
  });
  if (!t.refresh_token)
    throw new Error(
      "Google did not return a refresh token. Remove this app at myaccount.google.com/permissions and connect again.",
    );
  const email = emailFromIdToken(t.id_token);
  saveSettings({ google_refresh_token: t.refresh_token, google_email: email });
  cached = t.access_token ? { token: t.access_token, exp: Date.now() + (t.expires_in ?? 3000) * 1000 } : null;
  return email;
}

let cached: { token: string; exp: number } | null = null;

export function googleConnected(): boolean {
  return !!getSettings().google_refresh_token;
}

async function accessToken(): Promise<string> {
  if (cached && cached.exp - 60_000 > Date.now()) return cached.token;
  const rt = getSettings().google_refresh_token;
  if (!rt) throw new Error("Google is not connected. Connect it in Settings > Email.");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: rt });
  if (!t.access_token) throw new Error("Google did not return an access token.");
  cached = { token: t.access_token, exp: Date.now() + (t.expires_in ?? 3000) * 1000 };
  return cached.token;
}

export function disconnectGoogle() {
  const rt = getSettings().google_refresh_token;
  saveSettings({ google_refresh_token: "", google_email: "" });
  cached = null;
  if (rt) {
    // best effort revoke
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rt)}`, { method: "POST" }).catch(() => {});
  }
}

/** users.messages.send with a raw RFC 2822 message. Returns the Gmail message id. */
export async function gmailSend(raw: Buffer): Promise<string> {
  const token = await accessToken();
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: raw.toString("base64url") }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    const m = json.error?.message || `HTTP ${res.status}`;
    if (res.status === 403 && /not been used|disabled/i.test(m))
      throw new Error(`Gmail API is not enabled for the Google Cloud project: ${m}`);
    throw new Error(`Gmail send failed: ${m}`);
  }
  return json.id;
}
