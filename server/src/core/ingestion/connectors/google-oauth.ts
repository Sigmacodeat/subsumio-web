/**
 * Google OAuth2 helper — PKCE flow for Google Drive / Gmail connectors.
 *
 * GBrain acts as an OAuth client (not server) against Google's
 * authorization endpoint. Uses PKCE for security (no client_secret needed
 * in the auth URL; only at the token exchange step).
 *
 * Flow:
 *   1. generateAuthUrl(clientId, redirectUri, scopes) → URL + codeVerifier
 *   2. User opens URL in browser, approves consent
 *   3. Google redirects to redirectUri with ?code=...&state=...
 *   4. exchangeCode(code, codeVerifier, clientId, clientSecret, redirectUri) → tokens
 *   5. Tokens stored in ~/.gbrain/connectors/<service>.json
 *   6. BaseConnector.refreshToken() handles automatic refresh
 *
 * Scopes:
 *   - Google Drive: https://www.googleapis.com/auth/drive.readonly
 *   - Gmail:        https://www.googleapis.com/auth/gmail.readonly
 *
 * Reference: https://developers.google.com/identity/protocols/oauth2/native-app
 */

import { randomBytes, createHash } from "node:crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleAuthUrl {
  /** The URL to open in the user's browser. */
  url: string;
  /** The PKCE code_verifier (must be sent to exchangeCode). */
  codeVerifier: string;
  /** The state parameter (must match in the callback). */
  state: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/** Generate a random base64url-safe string. */
function randomBase64url(n: number): string {
  return randomBytes(n).toString("base64url");
}

/** SHA-256 hash for PKCE code_challenge. */
function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Generate the Google OAuth2 authorization URL with PKCE.
 *
 * @param clientId     OAuth2 client ID from Google Cloud Console
 * @param redirectUri  Must match the URI registered in Google Cloud Console
 * @param scopes       Space-separated OAuth scopes
 * @returns            Auth URL + codeVerifier + state (store all three)
 */
export function generateAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string
): GoogleAuthUrl {
  const codeVerifier = randomBase64url(32);
  const codeChallenge = pkceChallenge(codeVerifier);
  const state = randomBase64url(16);

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline"); // Request refresh_token
  url.searchParams.set("prompt", "consent"); // Force consent screen (ensures refresh_token)

  return { url: url.toString(), codeVerifier, state };
}

/**
 * Exchange the authorization code for tokens.
 *
 * @param code           The ?code=... from the redirect
 * @param codeVerifier   The verifier from generateAuthUrl
 * @param clientId       OAuth2 client ID
 * @param clientSecret   OAuth2 client secret
 * @param redirectUri    Must match the URI used in generateAuthUrl
 * @returns              Token response with access_token, refresh_token, expires_in
 */
export async function exchangeCode(
  code: string,
  codeVerifier: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${err}`);
  }

  return (await res.json()) as GoogleTokenResponse;
}

/**
 * Refresh an access token using the refresh token.
 *
 * @param refreshToken  The refresh_token from the initial exchange
 * @param clientId      OAuth2 client ID
 * @param clientSecret  OAuth2 client secret
 * @returns             New token response (may or may not include a new refresh_token)
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${err}`);
  }

  return (await res.json()) as GoogleTokenResponse;
}
