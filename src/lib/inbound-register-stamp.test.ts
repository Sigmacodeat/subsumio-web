// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "https://engine.test" }));

import { stampInboundEntry } from "./inbound-register-stamp";

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
});
