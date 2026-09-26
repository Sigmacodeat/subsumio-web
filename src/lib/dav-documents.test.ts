// @vitest-environment node
/**
 * WebDAV bridge: a document listing cut at the route's safety bound is shown
 * and logged as incomplete, never passed off as the whole drive.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createDavServer } from "../../scripts/dav-server";
import {
  DAV_TRUNCATION_NOTICE_NAME,
  davTruncationNotice,
  parseDavDocumentListing,
} from "./dav-documents";

const doc = (i: number) => ({
  slug: `docs/d-${i}`,
  title: `Dokument ${i}`,
  fileName: `d-${i}.pdf`,
  mimeType: "application/pdf",
  size: 10,
  updated: "2026-09-01T00:00:00.000Z",
  hasFile: true,
});

describe("parseDavDocumentListing", () => {
  it("reads truncated and limit, and treats a complete listing as complete", () => {
    expect(
      parseDavDocumentListing({ documents: [doc(1)], truncated: true, limit: 100000 })
    ).toEqual({ documents: [doc(1)], truncated: true, limit: 100000 });
    expect(parseDavDocumentListing({ documents: [doc(1)] })).toEqual({
      documents: [doc(1)],
      truncated: false,
      limit: null,
    });
    expect(parseDavDocumentListing({ error: "x" })).toBeNull();
    expect(parseDavDocumentListing(null)).toBeNull();
  });

  it("the notice names how many documents are shown and the bound", () => {
    const text = davTruncationNotice({
      documents: [doc(1), doc(2)],
      truncated: true,
      limit: 100000,
    });
    expect(text).toContain("nur 2 Dokumente");
    expect(text).toContain("100.000");
  });
});

describe("dav-server with a cut listing", () => {
  const auth = { Authorization: `Basic ${Buffer.from("x:user.secret").toString("base64")}` };
  let upstream: Server;
  let bridge: Server;
  let base = "";
  let truncated = true;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);

  async function listen(server: Server): Promise<number> {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    return (server.address() as AddressInfo).port;
  }

  beforeAll(async () => {
    upstream = createServer((req, res) => {
      if (req.url?.endsWith("/dav/documents")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            documents: [doc(1), doc(2)],
            ...(truncated ? { truncated: true, limit: 2 } : {}),
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });
    const upstreamPort = await listen(upstream);
    bridge = createDavServer(`http://127.0.0.1:${upstreamPort}`);
    base = `http://127.0.0.1:${await listen(bridge)}`;
  });

  afterAll(() => {
    bridge?.close();
    upstream?.close();
    vi.restoreAllMocks();
  });

  it("lists a notice file, marks the answer and logs the cut", async () => {
    truncated = true;
    warn.mockClear();
    const res = await fetch(`${base}/dokumente/`, {
      method: "PROPFIND",
      headers: { ...auth, Depth: "1" },
    });
    expect(res.status).toBe(207);
    expect(res.headers.get("x-subsumio-listing")).toBe("truncated");
    const xml = await res.text();
    expect(xml).toContain(DAV_TRUNCATION_NOTICE_NAME);
    expect(xml).toContain("d-2.pdf");
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("Dokumentliste unvollständig: 2 Dokumente gezeigt (Obergrenze 2)");
    expect(logged).not.toContain("secret");

    const notice = await fetch(`${base}/dokumente/${DAV_TRUNCATION_NOTICE_NAME}`, {
      headers: auth,
    });
    expect(notice.status).toBe(200);
    expect(await notice.text()).toContain("es gibt weitere");
  });

  it("a complete listing shows no notice and logs nothing", async () => {
    truncated = false;
    warn.mockClear();
    const res = await fetch(`${base}/dokumente/`, {
      method: "PROPFIND",
      headers: { ...auth, Depth: "1" },
    });
    expect(res.headers.get("x-subsumio-listing")).toBeNull();
    expect(await res.text()).not.toContain(DAV_TRUNCATION_NOTICE_NAME);
    const notice = await fetch(`${base}/dokumente/${DAV_TRUNCATION_NOTICE_NAME}`, {
      headers: auth,
    });
    expect(notice.status).toBe(404);
    expect(warn).not.toHaveBeenCalled();
  });
});
