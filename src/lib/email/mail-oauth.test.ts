import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMailOAuthUrl,
  emailFromIdToken,
  isMailOAuthConfigured,
  mailOAuthRedirectUri,
  refreshMailOAuthToken,
} from "./mail-oauth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function idToken(payload: Record<string, unknown>): string {
  return `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;
}

describe("mail OAuth", () => {
  it("is off until the operator registers an app", () => {
    expect(isMailOAuthConfigured("microsoft")).toBe(false);
    expect(() => buildMailOAuthUrl("microsoft", "s")).toThrow("mail_oauth_not_configured");
  });

  it("builds the Microsoft sign-in URL with IMAP, SMTP and offline scopes", () => {
    vi.stubEnv("MAIL_OAUTH_MICROSOFT_CLIENT_ID", "cid");
    vi.stubEnv("MAIL_OAUTH_MICROSOFT_CLIENT_SECRET", "sec");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.subsum.io/");
    const url = new URL(buildMailOAuthUrl("microsoft", "state123"));
    expect(url.origin + url.pathname).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
    );
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.subsum.io/api/email/oauth/microsoft/callback"
    );
    const scope = url.searchParams.get("scope") ?? "";
    expect(scope).toContain("offline_access");
    expect(scope).toContain("IMAP.AccessAsUser.All");
    expect(scope).toContain("SMTP.Send");
    expect(url.toString()).not.toContain("sec");
  });

  it("asks Google for offline access so a refresh token is issued", () => {
    vi.stubEnv("MAIL_OAUTH_GOOGLE_CLIENT_ID", "gid");
    vi.stubEnv("MAIL_OAUTH_GOOGLE_CLIENT_SECRET", "gsec");
    const url = new URL(buildMailOAuthUrl("google", "s"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(mailOAuthRedirectUri("google")).toMatch(/\/api\/email\/oauth\/google\/callback$/);
  });

  it("reads the mailbox address from the id token", () => {
    expect(emailFromIdToken(idToken({ email: "Kanzlei@Example.at" }))).toBe("kanzlei@example.at");
    expect(emailFromIdToken(idToken({ preferred_username: "ra@kanzlei.at" }))).toBe(
      "ra@kanzlei.at"
    );
    expect(emailFromIdToken(idToken({ sub: "x" }))).toBeNull();
    expect(emailFromIdToken("garbage")).toBeNull();
    expect(emailFromIdToken(undefined)).toBeNull();
  });

  it("refreshes an access token and surfaces provider errors without leaking secrets", async () => {
    vi.stubEnv("MAIL_OAUTH_GOOGLE_CLIENT_ID", "gid");
    vi.stubEnv("MAIL_OAUTH_GOOGLE_CLIENT_SECRET", "gsec");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "at-1", expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const ok = await refreshMailOAuthToken("google", "rt");
    expect(ok.accessToken).toBe("at-1");
    expect(ok.refreshToken).toBeNull();
    expect(new Date(ok.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain("grant_type=refresh_token");

    await expect(refreshMailOAuthToken("google", "rt")).rejects.toThrow(
      "mail_oauth_token_failed:invalid_grant"
    );
  });
});
