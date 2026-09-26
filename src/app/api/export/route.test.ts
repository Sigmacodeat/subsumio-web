/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
}));
vi.mock("@/lib/usage", () => ({ usageFor: async () => ({ pages: 1 }) }));

import { GET } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { logAudit } from "@/lib/audit";

const engineFetch = vi.fn(
  async () => new Response(JSON.stringify({ pages: [{ slug: "cases/x" }] }), { status: 200 })
);

describe("GET /api/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", engineFetch);
  });

  it("does not export the firm brain for firm members", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue({
      headers: { "x-subsumio-source": "org_firm" },
      brainId: "org_firm",
      plan: "team",
      user: { id: "u1", email: "assistenz@kanzlei.example", role: "client_viewer", orgId: "org_1" },
    } as any);
    const res = await GET(new NextRequest("http://localhost:3000/api/export"));
    const body = JSON.parse(await res.text());
    expect(body.brain).toMatchObject({ excluded: "firm_brain", pages: [] });
    expect(body.usage).toBeNull();
    expect(engineFetch).not.toHaveBeenCalled();
  });

  it("exports the personal brain for users without a firm", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue({
      headers: { "x-subsumio-source": "brain_solo" },
      brainId: "brain_solo",
      plan: "pro",
      user: { id: "u2", email: "solo@example.com", role: "admin" },
    } as any);
    const res = await GET(new NextRequest("http://localhost:3000/api/export"));
    const body = JSON.parse(await res.text());
    expect(body.brain.pages).toHaveLength(1);
  });

  it("removes the SMTP password from the Kanzlei settings in the personal export", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue({
      headers: { "x-subsumio-source": "brain_solo" },
      brainId: "brain_solo",
      plan: "pro",
      user: { id: "u2", email: "solo@example.com", role: "admin" },
    } as any);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              format: "subsumio-export-v1",
              pages: [
                {
                  slug: "legal/settings/kanzlei",
                  type: "kanzlei_settings",
                  frontmatter: { smtpUser: "u", smtpPassword: "klartext-alt" },
                },
              ],
            }),
            { status: 200 }
          )
      )
    );
    const res = await GET(new NextRequest("http://localhost:3000/api/export"));
    const text = await res.text();
    expect(text).not.toContain("klartext-alt");
    const body = JSON.parse(text);
    expect(body.brain.format).toBe("subsumio-export-v1");
    expect(body.brain.pages[0].frontmatter).toEqual({ smtpUser: "u", smtpPasswordSet: true });
  });

  it("writes an audit entry for a successful export", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue({
      headers: { "x-subsumio-source": "brain_solo" },
      brainId: "brain_solo",
      plan: "pro",
      user: { id: "u2", email: "solo@example.com", role: "admin" },
    } as any);
    const res = await GET(new NextRequest("http://localhost:3000/api/export"));
    expect(res.status).toBe(200);
    expect(vi.mocked(logAudit)).toHaveBeenCalledWith(
      "admin.data_export",
      "account_export",
      expect.objectContaining({ details: { brain_included: true }, userId: "u2" })
    );
  });
});
