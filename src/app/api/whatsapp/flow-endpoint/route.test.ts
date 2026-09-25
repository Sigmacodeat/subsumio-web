import type { NextRequest } from "next/server";
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ signatureValid: true }));

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/rate-limit", () => ({ clientIp: () => "127.0.0.1" }));
vi.mock("@/lib/whatsapp/verify", () => ({
  verifyWhatsAppSignature: vi.fn(() => state.signatureValid),
}));
// Test crypto: the "encrypted" flow data is the plain request JSON.
vi.mock("@/lib/whatsapp/flow-crypto", () => ({
  decryptFlowRequest: (b: { encrypted_flow_data: string }) => ({
    request: JSON.parse(b.encrypted_flow_data),
    aesKey: Buffer.alloc(16),
    iv: Buffer.alloc(16),
  }),
  encryptFlowResponse: (response: unknown) => JSON.stringify(response),
}));
vi.mock("@/lib/api-handler", () => ({
  createWebhookHandler:
    (_opts: unknown, handler: (body: unknown, req: Request) => Promise<Response>) =>
    (req: Request) =>
      handler(undefined, req),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

import { verifyWhatsAppSignature } from "@/lib/whatsapp/verify";
import { POST } from "./route";

interface Engine {
  pages: Map<string, Record<string, unknown>>;
  writeStatus: number;
  conflictNames: string[];
  writes: Array<Record<string, unknown>>;
}
let engine: Engine;

beforeEach(() => {
  state.signatureValid = true;
  process.env.WHATSAPP_DEFAULT_BRAIN_ID = "brain1";
  engine = {
    pages: new Map([
      [
        "legal/cases/2025-0042",
        { slug: "legal/cases/2025-0042", frontmatter: { case_number: "2025/0042" } },
      ],
    ]),
    writeStatus: 200,
    conflictNames: [],
    writes: [],
  };
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (url.pathname.startsWith("/api/pages/") && method === "GET") {
      const slug = decodeURIComponent(url.pathname.slice("/api/pages/".length));
      const page = engine.pages.get(slug);
      return page ? Response.json(page) : new Response("nf", { status: 404 });
    }
    if (url.pathname === "/api/legal/conflict-check") {
      const { name } = JSON.parse(String(init?.body)) as { name: string };
      return Response.json({
        matches: engine.conflictNames.includes(name)
          ? [{ name, slug: "contacts/x", type: "legal_contact" }]
          : [],
      });
    }
    if (url.pathname === "/api/pages" && method === "POST") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (engine.writeStatus !== 200) return new Response("no", { status: engine.writeStatus });
      engine.writes.push(body);
      engine.pages.set(String(body.slug), body);
      return Response.json({ slug: body.slug });
    }
    return new Response("unexpected", { status: 599 });
  }) as unknown as typeof fetch;
});

function flowRequest(data: Record<string, unknown>) {
  const request = {
    version: "3.0",
    action: "data_exchange",
    screen: "REVIEW",
    flow_token: "case_intake:x",
    data,
  };
  return POST(
    new Request("http://x/api/whatsapp/flow-endpoint", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=abc" },
      body: JSON.stringify({
        encrypted_aes_key: "k",
        encrypted_flow_data: JSON.stringify(request),
        initial_vector: "iv",
      }),
    }) as unknown as NextRequest
  );
}

const createCase = {
  action: "create_case",
  client_name: "Max Muster",
  opponent_name: "Gegner GmbH",
  legal_area: "civil",
  description: "Sachverhalt",
  case_number: "2025-0042",
};

describe("WhatsApp flow endpoint — Neue Akte (KOM-16)", () => {
  it("rejects a request without a valid signature (fail closed)", async () => {
    state.signatureValid = false;
    const res = await flowRequest(createCase);
    expect(res.status).toBe(401);
    expect(engine.writes).toHaveLength(0);
  });

  it("checks the signature over the raw request body", async () => {
    await flowRequest(createCase);
    expect(verifyWhatsAppSignature).toHaveBeenCalledWith(expect.any(String), "sha256=abc");
  });

  it("never uses the sender's case number as slug — an existing matter stays untouched", async () => {
    const res = await flowRequest(createCase);
    const body = JSON.parse(await res.text()) as { screen: string; data: Record<string, string> };
    expect(body.screen).toBe("SUCCESS");
    expect(engine.writes).toHaveLength(1);
    const written = engine.writes[0]!;
    expect(written.slug).not.toBe("legal/cases/2025-0042");
    expect(written.slug).toMatch(/^legal\/cases\/wa-\d{4}-[a-z0-9]{8}-[0-9a-f]{8}$/);
    expect(written.merge).toBeUndefined();
    expect(written.frontmatter).toMatchObject({
      client_reference: "2025-0042",
      conflict_status: "conflict_cleared",
    });
    expect(engine.pages.get("legal/cases/2025-0042")).toEqual({
      slug: "legal/cases/2025-0042",
      frontmatter: { case_number: "2025/0042" },
    });
    expect(body.data.case_slug).toBe(written.slug);
  });

  it("does not report SUCCESS when the engine refuses the write", async () => {
    engine.writeStatus = 500;
    const res = await flowRequest(createCase);
    const body = JSON.parse(await res.text()) as { screen: string; data: Record<string, string> };
    expect(body.screen).not.toBe("SUCCESS");
    expect(body.data.error).toBe("processing_failed");
  });

  it("files a conflicting request for review instead of creating a matter", async () => {
    engine.conflictNames = ["Gegner GmbH"];
    const res = await flowRequest(createCase);
    const body = JSON.parse(await res.text()) as { screen: string; data: Record<string, string> };
    expect(body.screen).toBe("SUCCESS");
    expect(body.data.case_slug).toBe("");
    expect(engine.writes).toHaveLength(1);
    expect(engine.writes[0]).toMatchObject({
      type: "intake_request",
      frontmatter: { conflict_check_status: "conflict" },
    });
  });
});
