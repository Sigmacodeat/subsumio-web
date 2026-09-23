import { describe, test, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

// Postgres ist in Tests nicht konfiguriert → In-Memory-Fallback-Pfad.
vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "https://engine.test",
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
}));
// withRetry als Passthrough — Fehlerpfade sollen sofort werfen, nicht back-offen.
vi.mock("@/lib/retry", () => ({
  withRetry: <T>(fn: () => Promise<T>) => fn(),
  externalFetchTimeout: () => AbortSignal.timeout(5_000),
}));
const mockOutbox = vi.hoisted(() => ({
  enqueueAllPostUploadTasks: vi.fn(async () => {}),
}));
vi.mock("@/lib/post-upload-outbox", () => mockOutbox);

type RciidModule = typeof import("./rciid");
let mod: RciidModule;

const fetchMock = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("RCIID_API_KEY", "test-key");
  vi.stubEnv("RCIID_API_URL", "https://rciid.test/api");
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  mod = await import("./rciid");
});

const REG = { brainId: "brain-1", caseSlug: "akte/mandant-2025-001", userId: "u1" };

describe("registerRciidCase / resolveRciidCase (in-memory fallback)", () => {
  test("roundtrip: registrierter Case wird aufgelöst", async () => {
    await mod.registerRciidCase("rc-1", REG);
    expect(await mod.resolveRciidCase("rc-1")).toEqual(REG);
  });

  test("unbekannter Case → null", async () => {
    expect(await mod.resolveRciidCase("gibts-nicht")).toBeNull();
  });

  test("doppelte Registrierung: erste gewinnt (ON CONFLICT DO NOTHING-Parität)", async () => {
    await mod.registerRciidCase("rc-2", REG);
    await mod.registerRciidCase("rc-2", { brainId: "brain-2", caseSlug: "andere-akte" });
    expect((await mod.resolveRciidCase("rc-2"))?.brainId).toBe("brain-1");
  });
});

describe("verifyWebhookSignature", () => {
  const secret = "whsec-test";
  const body = '{"event_id":"e1"}';
  const sign = (b: string) => createHmac("sha256", secret).update(b, "utf8").digest("hex");

  test("gültige Signatur → true", () => {
    expect(mod.verifyWebhookSignature(body, sign(body), secret)).toBe(true);
  });

  test("manipulierter Body → false", () => {
    expect(mod.verifyWebhookSignature(body + "x", sign(body), secret)).toBe(false);
  });

  test("fehlende/falsche Signatur → false (kein Throw bei Längen-Mismatch)", () => {
    expect(mod.verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(mod.verifyWebhookSignature(body, "kurz", secret)).toBe(false);
  });
});

describe("parseWebhookEvent", () => {
  test("valide Payload → Event", () => {
    const raw = JSON.stringify({
      event_id: "e1",
      case_id: "c1",
      event_type: "report_ready",
      status: "completed",
      timestamp: "t",
    });
    expect(mod.parseWebhookEvent(raw)?.event_type).toBe("report_ready");
  });

  test("kaputtes JSON / fehlende Pflichtfelder → null", () => {
    expect(mod.parseWebhookEvent("{kein json")).toBeNull();
    expect(mod.parseWebhookEvent(JSON.stringify({ case_id: "c1" }))).toBeNull();
  });
});

describe("fileReportToCase", () => {
  const pdfResponse = () =>
    new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    });

  test("Erfolg: PDF-Download → Engine-Upload → Post-Upload-Tasks queued", async () => {
    fetchMock
      .mockResolvedValueOnce(pdfResponse()) // downloadReportPdf
      .mockResolvedValueOnce(Response.json({ slug: "dokumente/rciid-report-1" })); // engine upload

    const result = await mod.fileReportToCase("rc-9", REG);

    expect(result).toEqual({ saved: true, docSlug: "dokumente/rciid-report-1" });
    // Upload ging an den Engine-Endpoint der registrierten Brain
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(uploadUrl).toBe("https://engine.test/api/upload");
    expect((uploadInit.headers as Record<string, string>)["x-subsumio-source"]).toBe("brain-1");
    // Durable Pipeline: reconcile_case haengt das Dokument an case.documents[]
    expect(mockOutbox.enqueueAllPostUploadTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        doc_slug: "dokumente/rciid-report-1",
        case_slug: REG.caseSlug,
        brain_id: REG.brainId,
      })
    );
  });

  test("PDF-Download schlägt fehl → wirft, kein Upload", async () => {
    fetchMock.mockResolvedValueOnce(new Response("upstream down", { status: 502 }));
    await expect(mod.fileReportToCase("rc-9", REG)).rejects.toThrow(/PDF-Download/);
    expect(mockOutbox.enqueueAllPostUploadTasks).not.toHaveBeenCalled();
  });

  test("Engine-Upload schlägt fehl → wirft, keine Tasks", async () => {
    fetchMock
      .mockResolvedValueOnce(pdfResponse())
      .mockResolvedValueOnce(new Response("engine error", { status: 500 }));
    await expect(mod.fileReportToCase("rc-9", REG)).rejects.toThrow(/Engine-Upload/);
    expect(mockOutbox.enqueueAllPostUploadTasks).not.toHaveBeenCalled();
  });

  test("Upload ohne slug → wirft (kein stiller Erfolg)", async () => {
    fetchMock.mockResolvedValueOnce(pdfResponse()).mockResolvedValueOnce(Response.json({}));
    await expect(mod.fileReportToCase("rc-9", REG)).rejects.toThrow(/Slug/);
  });

  test("nicht konfiguriert → RCIID_NOT_CONFIGURED", async () => {
    vi.stubEnv("RCIID_API_KEY", "");
    vi.resetModules();
    const unconfigured = await import("./rciid");
    await expect(unconfigured.fileReportToCase("rc-9", REG)).rejects.toThrow(/nicht konfiguriert/);
  });
});
