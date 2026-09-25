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
vi.mock("@/lib/inbound-register-stamp", () => ({
  stampInboundEntryBestEffort: vi.fn(),
}));

import { POST } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { stampInboundEntryBestEffort } from "@/lib/inbound-register-stamp";

function as(role: string, id = "u1") {
  vi.mocked(requireEngineContext).mockResolvedValue({
    headers: { "x-subsumio-source": "firm" },
    brainId: "firm",
    plan: "team",
    user: { id, role, email: `${id}@k.example`, name: id },
  } as any);
}

const engineWrites: string[] = [];
function engine(casePage: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        engineWrites.push(url);
        return new Response("{}", { status: 200 });
      }
      return casePage
        ? new Response(JSON.stringify(casePage), { status: 200 })
        : new Response("{}", { status: 404 });
    })
  );
}

function share(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost:3000/api/share", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
    })
  );
}

describe("POST /api/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    engineWrites.length = 0;
  });

  it("refuses client accounts (read-only role)", async () => {
    as("client_viewer");
    engine({ type: "legal_case", frontmatter: {} });
    const res = await share({ text: "Hallo" });
    expect(res.status).toBe(403);
    expect(engineWrites).toHaveLength(0);
    expect(stampInboundEntryBestEffort).not.toHaveBeenCalled();
  });

  it("refuses staff with only a read grant on a restricted matter", async () => {
    as("assistant", "u-read");
    engine({
      type: "legal_case",
      frontmatter: {
        permissions: {
          visibility: "restricted",
          grants: [{ user_id: "u-read", level: "read" }],
        },
      },
    });
    const res = await share({ text: "Hallo", caseSlug: "cases/a" });
    expect(res.status).toBe(403);
    expect(engineWrites).toHaveLength(0);
  });

  it("refuses a matter the engine does not show the caller", async () => {
    as("lawyer");
    engine(null);
    const res = await share({ text: "Hallo", caseSlug: "cases/hidden" });
    expect(res.status).toBe(404);
    expect(engineWrites).toHaveLength(0);
  });

  it("files shared content for staff with write access", async () => {
    as("lawyer");
    engine({ type: "legal_case", frontmatter: {} });
    const res = await share({ text: "Hallo", caseSlug: "cases/a" });
    expect(res.status).toBe(200);
    expect(engineWrites).toHaveLength(1);
    expect(stampInboundEntryBestEffort).toHaveBeenCalled();
  });
});
