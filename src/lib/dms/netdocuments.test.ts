// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://localhost:3001",
}));

vi.mock("./index", () => ({
  DMS_BASE: "https://dms.example.com",
  DMS_API_KEY: "test-key",
  dmsAuthHeaders: vi.fn(() => ({
    Authorization: "Bearer test-key",
    "Content-Type": "application/json",
  })),
  isDmsConfigured: vi.fn(() => true),
  importToBrainCommon: vi.fn(async () => ({ slug: "dms/doc-1", success: true })),
}));

import { netDocumentsConnector } from "./netdocuments";
import { isDmsConfigured } from "./index";

describe("netDocumentsConnector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("name is 'NetDocuments'", () => {
    expect(netDocumentsConnector.name).toBe("NetDocuments");
  });

  test("isConfigured delegates to isDmsConfigured", () => {
    expect(netDocumentsConnector.isConfigured()).toBe(true);
    expect(isDmsConfigured).toHaveBeenCalled();
  });

  test("search returns mapped documents", async () => {
    const mockResponse = {
      results: [
        { id: "d1", name: "Contract.pdf", extension: "pdf", author: { name: "Max" }, lastModified: "2024-01-01", size: 1024, version: "2", checkedOut: false },
        { id: "d2", name: "Letter.docx", author: {}, lastModified: "2024-02-01", size: 2048, checkedOut: true },
      ],
      totalCount: 2,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await netDocumentsConnector.search("contract", { limit: 5 });
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0].id).toBe("d1");
    expect(result.documents[0].type).toBe("pdf");
    expect(result.documents[0].author).toBe("Max");
    expect(result.documents[1].author).toBe("—"); // default
    expect(result.documents[1].checkoutStatus).toBe("checked_out");
    expect(result.folders).toEqual([]); // NetDocuments doesn't return folders
    expect(result.totalCount).toBe(2);
  });

  test("search with limit sets count param", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], totalCount: 0 }), { status: 200 }),
    );
    await netDocumentsConnector.search("test", { limit: 20 });
    const url = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(url).toContain("count=20");
  });

  test("search handles empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const result = await netDocumentsConnector.search("empty");
    expect(result.documents).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  test("getDocument returns mapped document", async () => {
    const mockDoc = {
      id: "d1", name: "Contract.pdf", extension: "pdf",
      author: { name: "Max" }, lastModified: "2024-01-01", size: 1024,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockDoc), { status: 200 }),
    );
    const doc = await netDocumentsConnector.getDocument("d1");
    expect(doc).not.toBeNull();
    expect(doc?.id).toBe("d1");
    expect(doc?.type).toBe("pdf");
  });

  test("getDocument returns null on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not found", { status: 404 }),
    );
    const doc = await netDocumentsConnector.getDocument("unknown");
    expect(doc).toBeNull();
  });

  test("getFolderContents returns mapped result", async () => {
    const mockResponse = {
      results: [{ id: "d1", name: "Doc1.pdf" }],
      totalCount: 1,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );
    const result = await netDocumentsConnector.getFolderContents("folder-1");
    expect(result.documents).toHaveLength(1);
    expect(result.folders).toEqual([]);
  });

  test("importToBrain delegates to importToBrainCommon", async () => {
    const doc = { id: "d1", name: "Test", type: "pdf", author: "Max", modifiedDate: "2024-01-01" };
    const result = await netDocumentsConnector.importToBrain(doc as any, "brain-1", {});
    expect(result.slug).toBe("dms/doc-1");
    expect(result.success).toBe(true);
  });
});
