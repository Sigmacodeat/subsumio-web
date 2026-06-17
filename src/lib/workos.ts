/**
 * WorkOS API Wrapper für SigmaBrain SSO/SAML.
 * Nutzt die WorkOS User Management API direkt über HTTP.
 *
 * Umgebungsvariablen:
 *   WORKOS_API_KEY      — Secret Key
 *   WORKOS_CLIENT_ID    — Client ID
 *   NEXT_PUBLIC_APP_URL — Callback Base URL
 */

const API_BASE = "https://api.workos.com";
const API_KEY = process.env.WORKOS_API_KEY || "";
const CLIENT_ID = process.env.WORKOS_CLIENT_ID || "";

export interface WorkOSProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId?: string;
  rawAttributes?: Record<string, unknown>;
}

export interface WorkOSAuthResponse {
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    email_verified: boolean;
    profile_picture_url?: string;
    organization_id?: string;
  };
  organization_id?: string;
}

export function isConfigured(): boolean {
  return Boolean(API_KEY && CLIENT_ID);
}

export function getAuthorizationUrl(opts: {
  redirectUri: string;
  state?: string;
  organizationId?: string;
  provider?: "MicrosoftOAuth" | "GoogleOAuth" | "SAML";
}): string {
  if (!CLIENT_ID) throw new Error("WorkOS not configured: WORKOS_CLIENT_ID missing");
  const url = new URL(`${API_BASE}/user_management/authorize`);
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  if (opts.state) url.searchParams.set("state", opts.state);
  if (opts.organizationId) url.searchParams.set("organization_id", opts.organizationId);
  if (opts.provider) url.searchParams.set("provider", opts.provider);
  return url.toString();
}

export async function authenticateWithCode(code: string, redirectUri: string): Promise<WorkOSAuthResponse> {
  if (!API_KEY) throw new Error("WorkOS not configured: WORKOS_API_KEY missing");

  const res = await fetch(`${API_BASE}/user_management/authenticate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = (await res.json()) as WorkOSAuthResponse & { error?: string; message?: string };
  if (!res.ok) {
    throw new Error(data.message || data.error || `WorkOS authentication failed: ${res.status}`);
  }
  return data;
}

export async function getUserProfile(userId: string): Promise<WorkOSProfile> {
  if (!API_KEY) throw new Error("WorkOS not configured");

  const res = await fetch(`${API_BASE}/user_management/users/${userId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  const data = (await res.json()) as WorkOSProfile & { error?: string };
  if (!res.ok) throw new Error(data.error || `WorkOS profile fetch failed: ${res.status}`);
  return data;
}
