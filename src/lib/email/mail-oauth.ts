// OAuth for mailboxes whose provider has switched off password logins
// (Microsoft 365, Google Workspace). The firm signs in at its provider; we
// receive a refresh token, keep it encrypted, and use short-lived access
// tokens for IMAP and SMTP (SASL XOAUTH2). No mailbox password ever reaches us.
//
// Requires an app registration per provider (operator task):
//   MAIL_OAUTH_MICROSOFT_CLIENT_ID / _CLIENT_SECRET   (multi-tenant Entra app)
//   MAIL_OAUTH_GOOGLE_CLIENT_ID    / _CLIENT_SECRET   (Google Cloud OAuth client)
// Redirect URI for both: {NEXT_PUBLIC_APP_URL}/api/email/oauth/<provider>/callback

import { env } from "@/lib/env";
import { externalFetchTimeout } from "@/lib/retry";

export type MailOAuthProvider = "microsoft" | "google";

interface ProviderConfig {
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  imapHost: string;
  smtpHost: string;
  smtpPort: number;
  clientIdEnv: string;
  clientSecretEnv: string;
  extraAuthParams: Record<string, string>;
}

export const MAIL_OAUTH_PROVIDERS: Record<MailOAuthProvider, ProviderConfig> = {
  microsoft: {
    label: "Microsoft 365",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: [
      "offline_access",
      "openid",
      "email",
      "https://outlook.office.com/IMAP.AccessAsUser.All",
      "https://outlook.office.com/SMTP.Send",
    ],
    imapHost: "outlook.office365.com",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    clientIdEnv: "MAIL_OAUTH_MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MAIL_OAUTH_MICROSOFT_CLIENT_SECRET",
    extraAuthParams: { prompt: "select_account" },
  },
  google: {
    label: "Google Workspace",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "email", "https://mail.google.com/"],
    imapHost: "imap.gmail.com",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    clientIdEnv: "MAIL_OAUTH_GOOGLE_CLIENT_ID",
    clientSecretEnv: "MAIL_OAUTH_GOOGLE_CLIENT_SECRET",
    // Without these Google returns a refresh token only on the very first consent.
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
};

export function isMailOAuthProvider(value: string): value is MailOAuthProvider {
  return value === "microsoft" || value === "google";
}

function credentials(provider: MailOAuthProvider): { id: string; secret: string } | null {
  const cfg = MAIL_OAUTH_PROVIDERS[provider];
  const id = env(cfg.clientIdEnv);
  const secret = env(cfg.clientSecretEnv);
  return id && secret ? { id, secret } : null;
}

export function isMailOAuthConfigured(provider: MailOAuthProvider): boolean {
  return credentials(provider) !== null;
}

export function mailOAuthRedirectUri(provider: MailOAuthProvider): string {
  const base = (env("NEXT_PUBLIC_APP_URL") || "https://app.subsum.io").replace(/\/$/, "");
  return `${base}/api/email/oauth/${provider}/callback`;
}

export function buildMailOAuthUrl(provider: MailOAuthProvider, state: string): string {
  const cfg = MAIL_OAUTH_PROVIDERS[provider];
  const creds = credentials(provider);
  if (!creds) throw new Error("mail_oauth_not_configured");
  const params = new URLSearchParams({
    client_id: creds.id,
    response_type: "code",
    redirect_uri: mailOAuthRedirectUri(provider),
    scope: cfg.scopes.join(" "),
    state,
    ...cfg.extraAuthParams,
  });
  return `${cfg.authorizeUrl}?${params.toString()}`;
}

export interface MailOAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  email: string | null;
}

/** E-mail claim from an id_token received directly from the token endpoint (TLS-authenticated). */
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
      preferred_username?: string;
      upn?: string;
    };
    const email = json.email ?? json.preferred_username ?? json.upn ?? "";
    return /^[^@\s]+@[^@\s]+$/.test(email) ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function tokenRequest(
  provider: MailOAuthProvider,
  body: Record<string, string>
): Promise<MailOAuthTokens> {
  const cfg = MAIL_OAUTH_PROVIDERS[provider];
  const creds = credentials(provider);
  if (!creds) throw new Error("mail_oauth_not_configured");
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: creds.id, client_secret: creds.secret, ...body }),
    signal: externalFetchTimeout(),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(`mail_oauth_token_failed:${data.error ?? res.status}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
    email: emailFromIdToken(data.id_token),
  };
}

export function exchangeMailOAuthCode(
  provider: MailOAuthProvider,
  code: string
): Promise<MailOAuthTokens> {
  return tokenRequest(provider, {
    grant_type: "authorization_code",
    code,
    redirect_uri: mailOAuthRedirectUri(provider),
  });
}

export function refreshMailOAuthToken(
  provider: MailOAuthProvider,
  refreshToken: string
): Promise<MailOAuthTokens> {
  return tokenRequest(provider, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: MAIL_OAUTH_PROVIDERS[provider].scopes.join(" "),
  });
}
