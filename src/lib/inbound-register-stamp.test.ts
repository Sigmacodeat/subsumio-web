// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
const mockEnqueue = vi.fn();
vi.stubGlobal("fetch", mockFetch);
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "https://engine.test" }));
vi.mock("@/lib/post-upload-outbox", () => ({
  enqueuePostUploadTask: (...args: unknown[]) => mockEnqueue(...args),
}));

import { stampInboundEntry, stampInboundEntryBestEffort } from "./inbound-register-stamp";

const HEADERS = { "x-subsumio-source": "brain-1" };

describe("stampInboundEntry", () => {
  beforeEach(() => vi.clearAllMocks());

  test("schreibt inbound_entry-Page mit Kanal und Akten-Bezug", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const entry = await stampInboundEntry(HEADERS, {
      channel: "portal",
      subject: "Vollmacht.pdf",
      senderName: "Mandantenportal",
      caseSlug: "akte/mueller",
      documentSlug: "dokumente/vollmacht",
    });

    expect(entry.channel).toBe("portal");
    expect(entry.direction).toBe("inbound");
    expect(entry.case_slug).toBe("akte/mueller");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://engine.test/api/pages");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe("inbound_entry");
    expect(body.slug).toMatch(/^legal\/inbound-register\//);
    expect(body.frontmatter.channel).toBe("portal");
    expect(body.frontmatter.document_slug).toBe("dokumente/vollmacht");
    // Auth-Header werden durchgereicht, Content-Type ergänzt
    const headers = init.headers as Record<string, string>;
    expect(headers["x-subsumio-source"]).toBe("brain-1");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  test("Engine-Fehler wirft (Caller entscheidet über best-effort)", async () => {
    mockFetch.mockResolvedValueOnce(new Response("down", { status: 503 }));
    await expect(stampInboundEntry(HEADERS, { channel: "email", subject: "X" })).rejects.toThrow(
      "inbound_stamp_failed_503"
    );
  });

  test("entryId-Option schreibt denselben Register-Slug (idempotenter Retry)", async () => {
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    const input = { channel: "portal" as const, subject: "Vollmacht.pdf" };
    const first = await stampInboundEntry(HEADERS, input, { entryId: "in-fixed-1" });
    const second = await stampInboundEntry(HEADERS, input, { entryId: "in-fixed-1" });
    expect(first.id).toBe("in-fixed-1");
    expect(second.id).toBe("in-fixed-1");
    const slugs = mockFetch.mock.calls.map(
      (c) => JSON.parse((c[1] as RequestInit).body as string).slug
    );
    expect(slugs).toEqual([
      "legal/inbound-register/in-fixed-1",
      "legal/inbound-register/in-fixed-1",
    ]);
  });
});

describe("stampInboundEntryBestEffort", () => {
  beforeEach(() => vi.clearAllMocks());

  test("schluckt Engine-Fehler und reiht inbound_stamp-Retry ein", async () => {
    mockFetch.mockResolvedValueOnce(new Response("down", { status: 503 }));
    mockEnqueue.mockResolvedValueOnce(undefined);

    await expect(
      stampInboundEntryBestEffort(
        HEADERS,
        { channel: "whatsapp", subject: "Scan.pdf", caseSlug: "akte/mueller" },
        "brain-1"
      )
    ).resolves.toBeUndefined();

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const [task, brainId] = mockEnqueue.mock.calls[0] as [
      { task_type: string; doc_slug: string; inbound: { entry_id: string; input: unknown } },
      string,
    ];
    expect(brainId).toBe("brain-1");
    expect(task.task_type).toBe("inbound_stamp");
    // doc_slug trägt die fixe entry-id → Drain-Upsert ist idempotent
    expect(task.doc_slug).toBe(task.inbound.entry_id);
    expect(task.inbound.input).toMatchObject({ channel: "whatsapp", subject: "Scan.pdf" });
  });

  test("Erfolgspfad reiht nichts ein", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await stampInboundEntryBestEffort(HEADERS, { channel: "email", subject: "X" }, "brain-1");
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  test("Enqueue-Fehler wird ebenfalls nur geloggt — der Eingang geht nie verloren", async () => {
    mockFetch.mockResolvedValueOnce(new Response("down", { status: 503 }));
    mockEnqueue.mockRejectedValueOnce(new Error("engine down"));
    await expect(
      stampInboundEntryBestEffort(HEADERS, { channel: "email", subject: "X" }, "brain-1")
    ).resolves.toBeUndefined();
  });
});
