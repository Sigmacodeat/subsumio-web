// A failed QR rendering is an error, never a look-alike pattern.
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(async () => ({
    headers: {},
    brainId: "b",
    plan: "team",
    user: { id: "u", email: "u@k.example", role: "lawyer" },
  })),
}));
vi.mock("qrcode", () => ({
  default: {
    toString: async () => {
      throw new Error("render failed");
    },
  },
}));

import { POST } from "./route";

describe("POST /api/2fa/qrcode", () => {
  it("answers 500 when the QR code cannot be rendered", async () => {
    const res = await POST(
      new NextRequest("http://localhost:3000/api/2fa/qrcode", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
        body: JSON.stringify({ data: "otpauth://totp/x?secret=ABC" }),
      })
    );
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).not.toContain("svg");
  });
});
