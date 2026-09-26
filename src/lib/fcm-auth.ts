/**
 * FCM HTTP v1 credentials: reads the Firebase service-account file
 * (FCM_SERVICE_ACCOUNT_PATH) and exchanges a signed JWT for an OAuth access
 * token. Shared by the push sender and the post-deploy smoke test, which
 * fetches a token without sending anything. Kept free of store/DB imports.
 */

export interface FcmServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let fcmToken: { token: string; expiresAt: number; email: string } | null = null;

export async function fcmAccessToken(account: FcmServiceAccount): Promise<string> {
  if (fcmToken && fcmToken.email === account.client_email && Date.now() < fcmToken.expiresAt) {
    return fcmToken.token;
  }
  const { createSign } = await import("node:crypto");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  const assertion = `${header}.${claims}.${signer.sign(account.private_key).toString("base64url")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!res.ok || !data.access_token) throw new Error(`FCM token request failed: ${res.status}`);
  fcmToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, (data.expires_in ?? 3600) - 120) * 1000,
    email: account.client_email,
  };
  return data.access_token;
}

export async function loadFcmServiceAccount(): Promise<FcmServiceAccount | null> {
  const path = process.env.FCM_SERVICE_ACCOUNT_PATH;
  if (!path) return null;
  const fs = await import("node:fs/promises");
  const parsed = JSON.parse(await fs.readFile(path, "utf-8")) as Partial<FcmServiceAccount>;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("FCM service account file is incomplete");
  }
  return parsed as FcmServiceAccount;
}
