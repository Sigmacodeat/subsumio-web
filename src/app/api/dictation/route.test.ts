// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ engine: null as null | (() => Response) }));

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/engine-pages", () => ({ listEnginePages: vi.fn(async () => []) }));
vi.mock("@/lib/api-handler", async (orig) => {
  const real = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...real,
    recordCreditConsumption: vi.fn(),
    createHandler:
      (
        opts: {
          body?: { parse: (v: unknown) => unknown };
          query?: { safeParse: (v: unknown) => { success: boolean; data?: unknown } };
        },
        handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
      ) =>
      async (req: Request) => {
        const ctx = { headers: {}, brainId: "b", user: { id: "u", email: "a@k.at", name: "A" } };
        if (req.method === "GET") {
          const parsed = opts.query!.safeParse(Object.fromEntries(new URL(req.url).searchParams));
          if (!parsed.success)
            return Response.json({ error: "validation_failed" }, { status: 400 });
          return handler(ctx, undefined, parsed.data);
        }
        return handler(ctx, opts.body!.parse(await req.json()), {});
      },
  };
});

import { GET, POST } from "./route";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith("/api/llm/transcribe") ? m.engine!() : Response.json({ ok: true })
    )
  );
});

const dictate = () =>
  (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://x/api/dictation", {
      method: "POST",
      body: JSON.stringify({
        duration_seconds: 5,
        audio_base64: Buffer.from("audio").toString("base64"),
        mime_type: "audio/webm",
      }),
    })
  );

describe("POST /api/dictation (R8-17)", () => {
  it("an EU-only refusal is a clear 503, not a request to retry", async () => {
    m.engine = () =>
      Response.json({ error: "eu_only_refused", message: "EU-only" }, { status: 403 });
    const res = await dictate();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("transcription_unavailable_eu");
    expect(json.error).not.toMatch(/erneut versuchen/);
  });

  it("with a working transcription the transcript is stored", async () => {
    m.engine = () =>
      Response.json({ text: "Sehr geehrte Damen und Herren", model: "x", provider: "y" });
    const res = await dictate();
    expect(res.status).toBe(200);
  });

  it("any other failure keeps the retry hint", async () => {
    m.engine = () => new Response("boom", { status: 502 });
    const res = await dictate();
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("transcription_failed");
  });
});

describe("GET /api/dictation", () => {
  it("?pending_corrections=true is accepted (R8-20)", async () => {
    const res = await (GET as unknown as (r: Request) => Promise<Response>)(
      new Request("http://x/api/dictation?pending_corrections=true")
    );
    expect(res.status).toBe(200);
  });
});
