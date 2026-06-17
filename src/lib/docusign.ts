/**
 * Docusign API Wrapper für SigmaBrain.
 * Unterstützt zwei Modi:
 *   1. OAuth 2.0 Authorization Code Flow (per-User, über /api/docusign/callback)
 *   2. JWT Grant Flow (Service-Account, globaler Zugriff)
 *
 * Features:
 *   - Token-Refresh mit refresh_token
 *   - Per-User Token-Management via UserStore
 *   - Idempotency-Tracking für Webhooks
 *   - Connection-Status-Prüfung
 */

import { getStore, type User } from "@/lib/auth/store";

const BASE = process.env.DOCUSIGN_BASE_URL || "https://demo.docusign.net/restapi/v2.1";
const IK = process.env.DOCUSIGN_INTEGRATION_KEY || "";
const SECRET = process.env.DOCUSIGN_SECRET_KEY || "";
const ACCOUNT = process.env.DOCUSIGN_ACCOUNT_ID || "";

export interface EnvelopeRequest {
  emailSubject: string;
  emailBlurb: string;
  documents: Array<{ documentBase64: string; name: string; documentId: string }>;
  recipients: {
    signers: Array<{
      email: string;
      name: string;
      recipientId: string;
      routingOrder: string;
      tabs?: {
        signHereTabs?: Array<{ documentId: string; pageNumber: string; xPosition: string; yPosition: string }>;
      };
    }>;
  };
  status: "sent" | "created";
}

export interface EnvelopeSummary {
  envelopeId: string;
  status: string;
  emailSubject: string;
  createdDateTime: string;
  sentDateTime?: string;
  completedDateTime?: string;
  recipients?: {
    signers?: Array<{
      email: string;
      name: string;
      status: string;
      signedDateTime?: string;
    }>;
  };
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

// ---------------------------------------------------------------------------
// Service-Account JWT Grant (global, für Webhooks & Admin-Ops)
// ---------------------------------------------------------------------------

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getServiceAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  if (!IK || !SECRET) throw new Error("Docusign nicht konfiguriert: DOCUSIGN_INTEGRATION_KEY / SECRET_KEY fehlen.");

  const res = await fetch(`${BASE.replace(/restapi.*/, "oauth/token")}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await buildJwt(),
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok) throw new Error(`Docusign Auth fehlgeschlagen: ${JSON.stringify(data)}`);
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function buildJwt(): Promise<string> {
  const privateKeyB64 = process.env.DOCUSIGN_PRIVATE_KEY;
  if (!privateKeyB64) {
    throw new Error("Docusign JWT requires DOCUSIGN_PRIVATE_KEY (base64-encoded PEM).");
  }
  const privateKeyPem = Buffer.from(privateKeyB64, "base64").toString("utf-8");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: IK,
    sub: ACCOUNT,
    aud: "account-d.docusign.com",
    iat: now,
    exp: now + 3600,
    scope: "signature impersonation",
  };

  const header = { alg: "RS256", typ: "JWT" };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const encoder = new TextEncoder();
  const pemLines = privateKeyPem.split("\n").filter((l) => !l.includes("BEGIN") && !l.includes("END")).join("");
  const keyData = Uint8Array.from(atob(pemLines), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(signingInput));
  const encodedSig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${signingInput}.${encodedSig}`;
}

// ---------------------------------------------------------------------------
// Per-User OAuth Token Management
// ---------------------------------------------------------------------------

export interface DocusignConnection {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string; // ISO timestamp
  accountId?: string;
  baseUri?: string;
}

function getUserDocusign(user: User): DocusignConnection | null {
  if (!user.docusignAccessToken || !user.docusignTokenExpiresAt) return null;
  return {
    accessToken: user.docusignAccessToken,
    refreshToken: user.docusignRefreshToken ?? undefined,
    expiresAt: user.docusignTokenExpiresAt,
  };
}

async function refreshUserToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch("https://account-d.docusign.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: IK,
      client_secret: SECRET,
    }),
  });
  const data = (await res.json()) as TokenResponse & { error?: string };
  if (!res.ok) throw new Error(data.error || `Docusign refresh failed: ${JSON.stringify(data)}`);
  return data;
}

export async function getUserAccessToken(userId: string): Promise<string> {
  const store = getStore();
  const user = await store.getById(userId);
  if (!user) throw new Error("user_not_found");

  const conn = getUserDocusign(user);
  if (!conn) throw new Error("docusign_not_connected");

  const expiresAt = new Date(conn.expiresAt).getTime();
  if (expiresAt > Date.now() + 60_000) {
    return conn.accessToken;
  }

  // Token expired or about to expire — refresh if possible
  if (conn.refreshToken) {
    try {
      const refreshed = await refreshUserToken(conn.refreshToken);
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await store.update(userId, {
        docusignAccessToken: refreshed.access_token,
        docusignRefreshToken: refreshed.refresh_token ?? conn.refreshToken,
        docusignTokenExpiresAt: newExpiresAt,
      });
      return refreshed.access_token;
    } catch (err) {
      console.error("[docusign] token refresh failed:", err instanceof Error ? err.message : String(err));
      // Fall through to throw
    }
  }

  throw new Error("docusign_token_expired");
}

export async function disconnectUser(userId: string): Promise<void> {
  const store = getStore();
  await store.update(userId, {
    docusignAccessToken: null,
    docusignRefreshToken: null,
    docusignTokenExpiresAt: null,
  });
}

// ---------------------------------------------------------------------------
// API Operations
// ---------------------------------------------------------------------------

export async function createEnvelope(req: EnvelopeRequest): Promise<{ envelopeId: string; status: string }> {
  const token = await getServiceAccessToken();
  const res = await fetch(`${BASE}/accounts/${ACCOUNT}/envelopes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const data = (await res.json()) as { envelopeId: string; status: string; errorCode?: string; message?: string };
  if (!res.ok) throw new Error(data.message || `Docusign Envelope fehlgeschlagen: ${data.errorCode}`);
  return { envelopeId: data.envelopeId, status: data.status };
}

export async function createEnvelopeAsUser(userId: string, req: EnvelopeRequest): Promise<{ envelopeId: string; status: string }> {
  const token = await getUserAccessToken(userId);
  const res = await fetch(`${BASE}/accounts/${ACCOUNT}/envelopes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const data = (await res.json()) as { envelopeId: string; status: string; errorCode?: string; message?: string };
  if (!res.ok) throw new Error(data.message || `Docusign Envelope fehlgeschlagen: ${data.errorCode}`);
  return { envelopeId: data.envelopeId, status: data.status };
}

export async function getEnvelopeStatus(envelopeId: string): Promise<{ status: string; signers: Array<{ status: string; signedDateTime?: string }> }> {
  const token = await getServiceAccessToken();
  const res = await fetch(`${BASE}/accounts/${ACCOUNT}/envelopes/${envelopeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as { status: string; recipients?: { signers: Array<{ status: string; signedDateTime?: string }> } };
  return { status: data.status, signers: data.recipients?.signers ?? [] };
}

export async function listEnvelopes(userId: string, opts?: { fromDate?: string; status?: string; limit?: number }): Promise<EnvelopeSummary[]> {
  const token = await getUserAccessToken(userId);
  const url = new URL(`${BASE}/accounts/${ACCOUNT}/envelopes`);
  if (opts?.fromDate) url.searchParams.set("from_date", opts.fromDate);
  if (opts?.status) url.searchParams.set("status", opts.status);
  if (opts?.limit) url.searchParams.set("count", String(opts.limit));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as { envelopes?: EnvelopeSummary[]; errorCode?: string; message?: string };
  if (!res.ok) throw new Error(data.message || `Docusign List failed: ${data.errorCode}`);
  return data.envelopes ?? [];
}

// ---------------------------------------------------------------------------
// Idempotency Tracking (Webhook Deduplication)
// ---------------------------------------------------------------------------

const processedWebhookIds = new Set<string>();
const WEBHOOK_ID_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function isWebhookProcessed(eventId: string): boolean {
  return processedWebhookIds.has(eventId);
}

export function markWebhookProcessed(eventId: string): void {
  processedWebhookIds.add(eventId);
  // Simple TTL: clear oldest entries when set gets too large
  if (processedWebhookIds.size > 10_000) {
    const toDelete = Array.from(processedWebhookIds).slice(0, 1000);
    for (const id of toDelete) processedWebhookIds.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function isConfigured(): boolean {
  return Boolean(IK && SECRET && ACCOUNT);
}

export function getAuthUrl(redirectUri: string, state?: string): string {
  if (!IK) throw new Error("Docusign nicht konfiguriert: DOCUSIGN_INTEGRATION_KEY fehlt.");
  const url = new URL("https://account-d.docusign.com/oauth/auth");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "signature impersonation extended");
  url.searchParams.set("client_id", IK);
  url.searchParams.set("redirect_uri", redirectUri);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

