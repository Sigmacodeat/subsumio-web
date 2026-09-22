import { describe, expect, test } from "vitest";
import {
  buildMs365AuthUrl,
  isMs365Connected,
  ms365RedirectUri,
  MS365_DELEGATED_SCOPES,
} from "./msgraph-user";
import type { User } from "@/lib/auth/store";

describe("buildMs365AuthUrl", () => {
  test("baut eine korrekte Authorize-URL mit State und Delegated-Scopes", () => {
    const url = new URL(buildMs365AuthUrl("state-123"));
    expect(url.hostname).toBe("login.microsoftonline.com");
    expect(url.pathname).toContain("/oauth2/v2.0/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toBe(MS365_DELEGATED_SCOPES);
    expect(url.searchParams.get("scope")).toContain("Calendars.ReadWrite");
    expect(url.searchParams.get("scope")).toContain("offline_access");
    expect(url.searchParams.get("redirect_uri")).toBe(ms365RedirectUri());
  });
});

describe("isMs365Connected", () => {
  const base = { id: "u1", email: "a@k.at" } as User;

  test("verbunden nur mit Access- UND Refresh-Token", () => {
    expect(
      isMs365Connected({
        ...base,
        ms365AccessToken: "at",
        ms365RefreshToken: "rt",
      })
    ).toBe(true);
    expect(isMs365Connected({ ...base, ms365AccessToken: "at" })).toBe(false);
    expect(isMs365Connected({ ...base, ms365RefreshToken: "rt" })).toBe(false);
    expect(isMs365Connected(base)).toBe(false);
  });
});
