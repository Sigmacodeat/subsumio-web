/**
 * Unit tests for the `extract-document` minion handler's OWN logic:
 *   - missing stored bytes → terminal failure (no retry)
 *   - success → terminal status guaranteed ("ready" stamped if left processing)
 *   - password / unsupported-format errors → terminal failure (no retry)
 *   - any other error → re-thrown (transient → queue retries)
 *
 * The heavy collaborators (web-api's runExtractionAndImport/invokeOp and the
 * file-store read-back) are stubbed via mock.module so we exercise the handler's
 * branching without a real engine or extraction stack. The real error classes
 * from extract-document.ts are used so `instanceof` matches the production path.
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

// ── stubs ──────────────────────────────────────────────────────────────────

let runExtractionImpl: (
  engine: unknown,
  params: Record<string, unknown>
) => Promise<{ partSlugs: string[] }>;
let putPageCalls: Array<Record<string, unknown>>;
class FakeUnsupportedUploadError extends Error {}

mock.module("../src/commands/web-api.ts", () => ({
  runExtractionAndImport: (engine: unknown, params: Record<string, unknown>) =>
    runExtractionImpl(engine, params),
  invokeOp: async (_engine: unknown, name: string, params: Record<string, unknown>) => {
    putPageCalls.push({ name, ...params });
    return {};
  },
  UnsupportedUploadError: FakeUnsupportedUploadError,
}));

let storedBytes: Buffer | null;
mock.module("../src/core/file-store.ts", () => ({
  readStoredFile: async () =>
    storedBytes ? { data: storedBytes, filename: "doc.pdf", mimeType: null } : null,
  persistFileBuffer: async () => ({
    status: "uploaded",
    storage_path: "clean/test/doc.pdf",
    size_bytes: storedBytes?.byteLength ?? 0,
    content_hash: "test-hash",
  }),
}));

const { makeExtractDocumentHandler } =
  await import("../src/core/minions/handlers/extract-document.ts");
const { PasswordRequiredError } = await import("../src/core/extract-document.ts");

// ── helpers ──────────────────────────────────────────────────────────────────

function makeJob(data: Record<string, unknown>) {
  return { id: 1, name: "extract-document", data, updateProgress: async () => {} } as never;
}

/** Engine whose getPage reports the given terminal extraction_status. */
function engineWithStatus(status: string | undefined) {
  return {
    getPage: async () => ({ frontmatter: status ? { extraction_status: status } : {} }),
  } as never;
}

function lastPutPage() {
  return [...putPageCalls].reverse().find((c) => c.name === "put_page");
}

beforeEach(() => {
  putPageCalls = [];
  storedBytes = Buffer.from("dummy");
  runExtractionImpl = async () => ({ partSlugs: [] });
});

// ── tests ──────────────────────────────────────────────────────────────────

describe("extract-document handler", () => {
  test("missing stored bytes → terminal failure, no throw", async () => {
    storedBytes = null;
    const handler = makeExtractDocumentHandler({ engine: engineWithStatus("processing") });
    const result = await handler(makeJob({ slug: "akten/x", filename: "x.pdf", source_id: "t1" }));
    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("original_bytes_missing");
    const fm = lastPutPage()?.frontmatter as Record<string, unknown>;
    expect(fm.extraction_status).toBe("failed");
    expect(fm.extraction_error_code).toBe("original_bytes_missing");
  });

  test("success leaves page 'ready' when extraction already set it", async () => {
    const handler = makeExtractDocumentHandler({ engine: engineWithStatus("ready") });
    const result = await handler(makeJob({ slug: "akten/x", filename: "x.pdf", source_id: "t1" }));
    expect(result.status).toBe("ready");
    // Already "ready" → handler should NOT need to stamp a terminal status.
    expect(lastPutPage()).toBeUndefined();
  });

  test("success stamps 'ready' when page still shows 'processing'", async () => {
    const handler = makeExtractDocumentHandler({ engine: engineWithStatus("processing") });
    const result = await handler(makeJob({ slug: "akten/x", filename: "x.pdf", source_id: "t1" }));
    expect(result.status).toBe("ready");
    const fm = lastPutPage()?.frontmatter as Record<string, unknown>;
    expect(fm.extraction_status).toBe("ready");
  });

  test("PasswordRequiredError → terminal failure, no throw, no retry", async () => {
    runExtractionImpl = async () => {
      throw new PasswordRequiredError("pdf");
    };
    const handler = makeExtractDocumentHandler({ engine: engineWithStatus("processing") });
    const result = await handler(makeJob({ slug: "akten/x", filename: "x.pdf", source_id: "t1" }));
    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("password_required");
    const fm = lastPutPage()?.frontmatter as Record<string, unknown>;
    expect(fm.extraction_status).toBe("failed");
    expect(fm.extraction_error_code).toBe("password_required");
  });

  test("UnsupportedUploadError → terminal failure, no throw", async () => {
    runExtractionImpl = async () => {
      throw new FakeUnsupportedUploadError("nope");
    };
    const handler = makeExtractDocumentHandler({ engine: engineWithStatus("processing") });
    const result = await handler(makeJob({ slug: "akten/x", filename: "x.pdf", source_id: "t1" }));
    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("unsupported_format");
  });

  test("generic error → re-thrown so the queue retries (transient)", async () => {
    runExtractionImpl = async () => {
      throw new Error("transient DB blip");
    };
    const handler = makeExtractDocumentHandler({ engine: engineWithStatus("processing") });
    await expect(
      handler(makeJob({ slug: "akten/x", filename: "x.pdf", source_id: "t1" }))
    ).rejects.toThrow("transient DB blip");
    // still marks the page failed for visibility before re-throwing
    const fm = lastPutPage()?.frontmatter as Record<string, unknown>;
    expect(fm.extraction_status).toBe("failed");
    expect(fm.extraction_error_code).toBe("extraction_error");
  });

  test("requires slug and filename", async () => {
    const handler = makeExtractDocumentHandler({ engine: engineWithStatus("processing") });
    await expect(handler(makeJob({ source_id: "t1" }))).rejects.toThrow(/slug and .*filename/);
  });
});
