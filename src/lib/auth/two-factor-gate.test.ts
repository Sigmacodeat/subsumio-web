// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  isAllowedDuringTwoFactorSetup,
  twoFactorSetupRequiredResponse,
  TWO_FACTOR_SETUP_REQUIRED,
} from "./two-factor-gate";

describe("two-factor setup gate", () => {
  it.each([
    ["/api/auth/me", "GET"],
    ["/api/auth/2fa/setup", "POST"],
    ["/api/auth/2fa/verify", "POST"],
    ["/api/2fa/qrcode", "POST"],
    ["/api/auth/logout", "POST"],
    ["/api/auth/logout/", "POST"],
    ["/api/anything", "OPTIONS"],
    // Public sign-in endpoints never rely on the old session.
    ["/api/auth/login", "POST"],
    ["/api/auth/2fa/login-verify", "POST"],
    ["/api/auth/forgot", "POST"],
    ["/api/auth/reset", "POST"],
    ["/api/auth/sso/callback", "GET"],
  ])("lets %s %s through", (path, method) => {
    expect(isAllowedDuringTwoFactorSetup(path, method)).toBe(true);
  });

  it.each([
    ["/api/pages", "GET"],
    ["/api/legal/analyze", "POST"],
    ["/api/auth/me", "PATCH"],
    ["/api/auth/2fa/disable", "POST"],
    ["/api/api-keys", "POST"],
    ["/api/settings/calendar-feed", "POST"],
    ["/api/auth/2fa/setup/extra", "POST"],
    ["/api/auth/2fa/setupx", "POST"],
    ["", "GET"],
  ])("refuses %s %s", (path, method) => {
    expect(isAllowedDuringTwoFactorSetup(path, method)).toBe(false);
  });

  it("answers 403 two_factor_setup_required", async () => {
    const res = twoFactorSetupRequiredResponse();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe(TWO_FACTOR_SETUP_REQUIRED);
    expect(body.setupUrl).toBe("/dashboard/settings/security?require2fa=1");
  });
});
