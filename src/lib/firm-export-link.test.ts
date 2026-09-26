// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session-core", () => ({ getAuthSecret: () => "test-auth-secret-0123456789" }));

import {
  FIRM_EXPORT_LINK_MAX_MS,
  createFirmExportToken,
  firmExportDownloadUrl,
  verifyFirmExportToken,
} from "./firm-export-link";

const NOW = Date.UTC(2099, 0, 1, 12, 0, 0);
const caller = { userId: "u-admin", brainId: "brain-1" };

describe("firm export download link", () => {
  it("verifies for the admin and firm it was issued to", () => {
    const { token } = createFirmExportToken({ ...caller, exportId: 42 }, NOW);
    expect(verifyFirmExportToken(token, caller, NOW + 1000)).toEqual({ ok: true, exportId: 42 });
    expect(firmExportDownloadUrl(token)).toContain("/api/data-export/full/download?token=");
  });

  it("never lives longer than 24 hours, and not beyond the export's own expiry", () => {
    const far = createFirmExportToken(
      { ...caller, exportId: 1, expiresAt: new Date(NOW + 7 * 86_400_000).toISOString() },
      NOW
    );
    expect(Date.parse(far.expiresAt)).toBe(NOW + FIRM_EXPORT_LINK_MAX_MS);
    const soon = createFirmExportToken(
      { ...caller, exportId: 1, expiresAt: new Date(NOW + 3_600_000).toISOString() },
      NOW
    );
    expect(Date.parse(soon.expiresAt)).toBe(NOW + 3_600_000);
    expect(verifyFirmExportToken(soon.token, caller, NOW + 3_600_000)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("refuses another user, another firm and a forged token", () => {
    const { token } = createFirmExportToken({ ...caller, exportId: 7 }, NOW);
    expect(verifyFirmExportToken(token, { ...caller, userId: "u-other" }, NOW)).toEqual({
      ok: false,
      reason: "mismatch",
    });
    expect(verifyFirmExportToken(token, { ...caller, brainId: "brain-2" }, NOW)).toEqual({
      ok: false,
      reason: "mismatch",
    });
    const [body] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ u: "u-admin", b: "brain-1", e: 8, exp: NOW + 1000 })
    ).toString("base64url");
    expect(verifyFirmExportToken(`${forged}.${token.split(".")[1]}`, caller, NOW).ok).toBe(false);
    expect(verifyFirmExportToken(`${body}.x`, caller, NOW).ok).toBe(false);
    expect(verifyFirmExportToken(undefined, caller, NOW).ok).toBe(false);
  });
});
