import { describe, test, expect, vi, afterEach } from "vitest";
import {
  portalToken,
  portalSessionCookie,
  clearPortalSessionCookie,
  PORTAL_SESSION_COOKIE,
  PORTAL_SESSION_SLUG,
} from "./portal-session";

function reqWithCookie(cookie?: string): Request {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new Request("https://portal.example/x", { headers });
}

describe("portalToken", () => {
  test("expliziter Token gewinnt ueber Cookie", () => {
    const req = reqWithCookie(`${PORTAL_SESSION_COOKIE}=cookie-token`);
    expect(portalToken(req, "url-token")).toBe("url-token");
  });

  test("meine-akte-Platzhalter faellt auf Cookie zurueck", () => {
    // Der Platzhalter ist absichtlich KEIN Token — sonst wuerde der
    // String „meine-akte" als Token verifiziert werden.
    const req = reqWithCookie(`${PORTAL_SESSION_COOKIE}=real-token`);
    expect(portalToken(req, PORTAL_SESSION_SLUG)).toBe("real-token");
  });

  test("kein Parameter → Cookie; kein Cookie → leer", () => {
    const req = reqWithCookie(`${PORTAL_SESSION_COOKIE}=abc`);
    expect(portalToken(req)).toBe("abc");
    expect(portalToken(reqWithCookie())).toBe("");
  });

  test("Cookie-Wert wird URL-dekodiert (Tokens koennen Sonderzeichen haben)", () => {
    const req = reqWithCookie(`${PORTAL_SESSION_COOKIE}=${encodeURIComponent("tok.mit=punkt")}`);
    expect(portalToken(req)).toBe("tok.mit=punkt");
  });

  test("mehrere Cookies: richtiger Name wird gefunden", () => {
    const req = reqWithCookie(`other=1; ${PORTAL_SESSION_COOKIE}=mine; third=x`);
    expect(portalToken(req)).toBe("mine");
  });

  test("kaputtes %-Encoding → leer statt Crash", () => {
    const req = reqWithCookie(`${PORTAL_SESSION_COOKIE}=%E0%A4%A`);
    expect(portalToken(req)).toBe("");
  });
});

describe("portalSessionCookie", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("HttpOnly + SameSite=Strict + Path=/", () => {
    const c = portalSessionCookie("tok", 3600);
    expect(c).toContain(`${PORTAL_SESSION_COOKIE}=tok`);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Strict");
    expect(c).toContain("Path=/");
    expect(c).toContain("Max-Age=3600");
  });

  test("Token wird URL-encoded", () => {
    const c = portalSessionCookie("tok with space", 60);
    expect(c).toContain(`${PORTAL_SESSION_COOKIE}=tok%20with%20space`);
  });

  test("Secure nur in Production", () => {
    expect(portalSessionCookie("t", 60)).not.toContain("Secure");
    vi.stubEnv("NODE_ENV", "production");
    expect(portalSessionCookie("t", 60)).toContain("; Secure");
  });

  test("negative/komische Max-Age werden auf 0 gefloort", () => {
    expect(portalSessionCookie("t", -5)).toContain("Max-Age=0");
    expect(portalSessionCookie("t", 1.9)).toContain("Max-Age=1");
  });
});

describe("clearPortalSessionCookie", () => {
  test("Max-Age=0 loescht das Cookie", () => {
    const c = clearPortalSessionCookie();
    expect(c).toContain("Max-Age=0");
    expect(c).toContain("HttpOnly");
    expect(c).toContain(`${PORTAL_SESSION_COOKIE}=;`);
  });
});
