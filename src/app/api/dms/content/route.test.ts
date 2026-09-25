// @vitest-environment node

import { describe, test, expect, vi } from "vitest";

let connector: {
  isConfigured(): boolean;
  getDocument(id: string): Promise<unknown>;
  getDocumentContent(id: string): Promise<unknown>;
} | null = null;

vi.mock("@/lib/dms", () => ({
  getConnectorForBrain: vi.fn(async () => connector),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    _opts: unknown,
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<unknown>
  ) => {
    return async (req: Request) => {
      const ctx = { brainId: "test-brain", user: { email: "t@t.com" } };
      const url = new URL(req.url);
      const query = Object.fromEntries(url.searchParams);
      return handler(ctx, null, query, req);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

import type { NextRequest } from "next/server";
import { GET } from "./route";

function req(url: string, headers?: Record<string, string>) {
  return new Request(url, { headers }) as unknown as NextRequest;
}

const pdfConnector = (data: ArrayBuffer) => ({
  isConfigured: () => true,
  getDocument: async () => ({ id: "d1", name: "akte.pdf" }),
  getDocumentContent: async () => ({ data, mimeType: "application/pdf" }),
});

describe("GET /api/dms/content", () => {
  test("503 wenn DMS nicht konfiguriert", async () => {
    connector = null;
    const res = (await GET(req("http://localhost/api/dms/content?id=d1"))) as Response;
    expect(res.status).toBe(503);
  });

  test("404 wenn Dokument nicht existiert", async () => {
    connector = {
      isConfigured: () => true,
      getDocument: async () => null,
      getDocumentContent: async () => null,
    };
    const res = (await GET(req("http://localhost/api/dms/content?id=missing"))) as Response;
    expect(res.status).toBe(404);
  });

  test("502 wenn Content nicht abrufbar", async () => {
    connector = {
      isConfigured: () => true,
      getDocument: async () => ({ id: "d1", name: "akte.pdf" }),
      getDocumentContent: async () => null,
    };
    const res = (await GET(req("http://localhost/api/dms/content?id=d1"))) as Response;
    expect(res.status).toBe(502);
  });

  test("streamt Content mit MIME-Type und Dateinamen", async () => {
    const data = new Uint8Array([1, 2, 3]).buffer;
    connector = {
      isConfigured: () => true,
      getDocument: async () => ({ id: "d1", name: "akte.pdf" }),
      getDocumentContent: async () => ({ data, mimeType: "application/pdf" }),
    };
    const res = (await GET(req("http://localhost/api/dms/content?id=d1"))) as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-length")).toBe("3");
    expect(res.headers.get("content-disposition")).toContain("akte.pdf");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  test("Range-Request liefert 206 mit Content-Range", async () => {
    connector = pdfConnector(new Uint8Array([1, 2, 3, 4, 5]).buffer);
    const res = (await GET(
      req("http://localhost/api/dms/content?id=d1", { range: "bytes=1-3" })
    )) as Response;
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 1-3/5");
    expect(res.headers.get("content-length")).toBe("3");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([2, 3, 4]));
  });

  test("offene Range liefert bis zum Ende", async () => {
    connector = pdfConnector(new Uint8Array([1, 2, 3, 4, 5]).buffer);
    const res = (await GET(
      req("http://localhost/api/dms/content?id=d1", { range: "bytes=3-" })
    )) as Response;
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 3-4/5");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([4, 5]));
  });

  test("Suffix-Range liefert die letzten N Bytes", async () => {
    connector = pdfConnector(new Uint8Array([1, 2, 3, 4, 5]).buffer);
    const res = (await GET(
      req("http://localhost/api/dms/content?id=d1", { range: "bytes=-2" })
    )) as Response;
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 3-4/5");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([4, 5]));
  });

  test("überlanges Range-Ende wird auf Dateigröße gekappt", async () => {
    connector = pdfConnector(new Uint8Array([1, 2, 3]).buffer);
    const res = (await GET(
      req("http://localhost/api/dms/content?id=d1", { range: "bytes=0-99" })
    )) as Response;
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-2/3");
  });

  test("unbefriedigbare Range liefert 416", async () => {
    connector = pdfConnector(new Uint8Array([1, 2, 3]).buffer);
    const res = (await GET(
      req("http://localhost/api/dms/content?id=d1", { range: "bytes=10-20" })
    )) as Response;
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */3");
  });

  test("Multi-Range fällt auf volle 200-Antwort zurück", async () => {
    connector = pdfConnector(new Uint8Array([1, 2, 3]).buffer);
    const res = (await GET(
      req("http://localhost/api/dms/content?id=d1", { range: "bytes=0-1,2-3" })
    )) as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("3");
  });
});
