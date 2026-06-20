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

import { iManageConnector } from "./imanager";
import { dmsAuthHeaders, isDmsConfigured } from "./index";

describe("iManageConnector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("name is 'iManage Work'", () => {
    expect(iManageConnector.name).toBe("iManage Work");
  });

  test("isConfigured delegates to isDmsConfigured", () => {
    expect(iManageConnector.isConfigured()).toBe(true);
    expect(isDmsConfigured).toHaveBeenCalled();
  });

  test("search returns mapped documents", async () => {
    const mockResponse = {
      documents: [
        { id: "d1", name: "Contract.pdf", document_type: "pdf", author: "Max", last_modified: "2024-01-01", size: 1024, version: "1.0", checkout_status: "available" },
        { id: "d2", name: "Letter.docx", author: "Anna", last_modified: "2024-02-01", size: 2048 },
      ],
      folders: [{ id: "f1", name: "Folder 1", path: "/folder1", document_count: 5 }],
      total_count: 2,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await iManageConnector.search("contract", { limit: 10 });
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0].id).toBe("d1");
    expect(result.documents[0].type).toBe("pdf");
    expect(result.documents[1].type).toBe("document"); // default
    expect(result.documents[1].author).toBe("Anna");
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].id).toBe("f1");
    expect(result.totalCount).toBe(2);
  });

  test("search with folderId", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ documents: [], folders: [], total_count: 0 }), { status: 200 }),
    );
    await iManageConnector.search("test", { folderId: "folder-1" });
    const url = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(url).toContain("folder_id=folder-1");
  });

  test("search handles empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const result = await iManageConnector.search("empty");
    expect(result.documents).toEqual([]);
    expect(result.folders).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  test("getDocument returns mapped document", async () => {
    const mockDoc = {
      id: "d1", name: "Contract.pdf", document_type: "pdf",
      author: "Max", last_modified: "2024-01-01", size: 1024,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockDoc), { status: 200 }),
    );
    const doc = await iManageConnector.getDocument("d1");
    expect(doc).not.toBeNull();
    expect(doc?.id).toBe("d1");
    expect(doc?.name).toBe("Contract.pdf");
  });

  test("getDocument returns null on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not found", { status: 404 }),
    );
    const doc = await iManageConnector.getDocument("unknown");
    expect(doc).toBeNull();
  });

  test("getFolderContents returns mapped result", async () => {
    const mockResponse = {
      documents: [{ id: "d1", name: "Doc1.pdf" }],
      folders: [{ id: "f2", name: "Subfolder" }],
      total_count: 1,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );
    const result = await iManageConnector.getFolderContents("folder-1");
    expect(result.documents).toHaveLength(1);
    expect(result.folders).toHaveLength(1);
  });

  test("importToBrain delegates to importToBrainCommon", async () => {
    const doc = { id: "d1", name: "Test", type: "pdf", author: "Max", modifiedDate: "2024-01-01" };
    const result = await iManageConnector.importToBrain(doc as unknown as Parameters<typeof iManageConnector.importToBrain>[0], "brain-1", { "x-test": "1" });
    expect(result.slug).toBe("dms/doc-1");
    expect(result.success).toBe(true);
  });
});
