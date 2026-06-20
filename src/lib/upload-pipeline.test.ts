import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/virus-scan", () => ({
  scanFile: vi.fn(async () => ({ ok: true })),
}));

import { scanUpload } from "@/lib/upload-pipeline";
import { scanFile } from "@/lib/virus-scan";
import {
  computeSHA256,
  checkDuplicate,
  recordDuplicate,
  scanUploadWithDuplicateCheck,
  type DuplicateStore,
} from "@/lib/upload-pipeline";

const mockScanFile = vi.mocked(scanFile);

function makeFile(content: string, name = "test.pdf", type = "application/pdf"): File {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  const ab = new ArrayBuffer(bytes.length);
  new Uint8Array(ab).set(bytes);
  const file = new File([ab], name, { type });
  // jsdom doesn't implement File.arrayBuffer() — patch it
  file.arrayBuffer = vi.fn(async () => ab);
  return file;
}

function makeBigFile(sizeMB: number, name: string, type: string): File {
  const size = sizeMB * 1024 * 1024;
  const ab = new ArrayBuffer(size);
  const file = new File([ab], name, { type });
  file.arrayBuffer = vi.fn(async () => ab);
  return file;
}

describe("scanUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScanFile.mockResolvedValue({ ok: true });
  });

  it("accepts a valid file and returns buffer + clean name", async () => {
    const file = makeFile("PDF content", "document.pdf", "application/pdf");
    const result = await scanUpload(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file).toBe(file);
      expect(result.cleanName).toBe("document.pdf");
      expect(result.mimeType).toBe("application/pdf");
      expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    }
  });

  it("rejects non-File input", async () => {
    const result = await scanUpload("not a file");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("file_required");
      expect(result.status).toBe(400);
    }
  });

  it("rejects null input", async () => {
    const result = await scanUpload(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("file_required");
    }
  });

  it("rejects oversized file", async () => {
    const big = makeBigFile(60, "big.pdf", "application/pdf");
    const result = await scanUpload(big);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("file_too_large");
      expect(result.status).toBe(413);
    }
  });

  it("rejects oversized image (25MB image limit)", async () => {
    const bigImg = makeBigFile(30, "big.png", "image/png");
    const result = await scanUpload(bigImg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("file_too_large");
      expect(result.status).toBe(413);
    }
  });

  it("rejects unsupported MIME type", async () => {
    const file = new File(["content"], "malware.exe", { type: "application/x-msdownload" });
    const result = await scanUpload(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("unsupported_file_type");
      expect(result.status).toBe(415);
    }
  });

  it("sanitizes filename with path traversal", async () => {
    const file = makeFile("content", "../../../etc/passwd", "application/pdf");
    const result = await scanUpload(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cleanName).not.toContain("/");
      expect(result.cleanName).toMatch(/^[a-zA-Z0-9._-]+$/);
    }
  });

  it("sanitizes filename with special characters", async () => {
    const file = makeFile("content", "file with spaces & special!.pdf", "application/pdf");
    const result = await scanUpload(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cleanName).not.toContain(" ");
      expect(result.cleanName).not.toContain("&");
      expect(result.cleanName).not.toContain("!");
    }
  });

  it("calls virus scanner with file buffer and MIME type", async () => {
    const file = makeFile("PDF content", "test.pdf", "application/pdf");
    await scanUpload(file);
    expect(mockScanFile).toHaveBeenCalledOnce();
    const callArgs = mockScanFile.mock.calls[0];
    expect(callArgs[0]).toBeInstanceOf(ArrayBuffer);
    expect(callArgs[1]).toBe("application/pdf");
  });

  it("rejects when virus scanner detects executable", async () => {
    mockScanFile.mockResolvedValue({
      ok: false,
      reason: "executable_detected",
      label: "PE/EXE",
    });
    const file = makeFile("MZ...", "malware.pdf", "application/pdf");
    const result = await scanUpload(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("executable_detected");
      expect(result.status).toBe(422);
      expect(result.message).toContain("PE/EXE");
    }
  });

  it("rejects when virus scanner detects MIME mismatch", async () => {
    mockScanFile.mockResolvedValue({
      ok: false,
      reason: "mime_mismatch",
      expected: "application/pdf",
    });
    const file = makeFile("not really PDF", "fake.pdf", "application/pdf");
    const result = await scanUpload(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("mime_mismatch");
      expect(result.status).toBe(422);
    }
  });

  it("rejects when ClamAV detects infection", async () => {
    mockScanFile.mockResolvedValue({
      ok: false,
      reason: "clamav_infected",
      signature: "Eicar-Test-Signature",
    });
    const file = makeFile("infected", "infected.pdf", "application/pdf");
    const result = await scanUpload(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("clamav_infected");
      expect(result.status).toBe(422);
      expect(result.message).toContain("Eicar-Test-Signature");
    }
  });

  it("rejects when ClamAV is unreachable", async () => {
    mockScanFile.mockResolvedValue({
      ok: false,
      reason: "clamav_unreachable",
    });
    const file = makeFile("content", "test.pdf", "application/pdf");
    const result = await scanUpload(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("clamav_unreachable");
      expect(result.status).toBe(422);
    }
  });

  it("accepts XLSX file (extended allowlist)", async () => {
    const file = makeFile("xlsx content", "spreadsheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const result = await scanUpload(file);
    expect(result.ok).toBe(true);
  });

  it("accepts RTF file (extended allowlist)", async () => {
    const file = makeFile("{\\rtf1}", "doc.rtf", "application/rtf");
    const result = await scanUpload(file);
    expect(result.ok).toBe(true);
  });

  it("includes sha256 in successful result", async () => {
    const file = makeFile("test content", "test.pdf", "application/pdf");
    const result = await scanUpload(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sha256).toBeDefined();
      expect(result.sha256).toHaveLength(64);
      expect(result.is_duplicate).toBe(false);
    }
  });
});

// ── In-memory DuplicateStore for testing ──────────────────────────────

function makeMemoryStore(): DuplicateStore & { _data: Map<string, { slug: string; name: string }> } {
  const data = new Map<string, { slug: string; name: string }>();
  return {
    _data: data,
    lookup: async (sha256: string) => data.get(sha256) ?? null,
    record: async (sha256: string, slug: string, name: string) => {
      data.set(sha256, { slug, name });
    },
  };
}

// ── computeSHA256 ─────────────────────────────────────────────────────

describe("computeSHA256", () => {
  it("computes a deterministic SHA-256 hash", () => {
    const buf = new TextEncoder().encode("hello world").buffer;
    const hash = computeSHA256(buf);
    expect(hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
  });

  it("returns a 64-character hex string", () => {
    const buf = new ArrayBuffer(0);
    const hash = computeSHA256(buf);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("produces different hashes for different content", () => {
    const buf1 = new TextEncoder().encode("content A").buffer;
    const buf2 = new TextEncoder().encode("content B").buffer;
    expect(computeSHA256(buf1)).not.toBe(computeSHA256(buf2));
  });

  it("produces same hash for identical content", () => {
    const buf1 = new TextEncoder().encode("same content").buffer;
    const buf2 = new TextEncoder().encode("same content").buffer;
    expect(computeSHA256(buf1)).toBe(computeSHA256(buf2));
  });

  it("handles empty buffer", () => {
    const hash = computeSHA256(new ArrayBuffer(0));
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

// ── checkDuplicate ────────────────────────────────────────────────────

describe("checkDuplicate", () => {
  it("returns is_duplicate=false for unknown hash", async () => {
    const store = makeMemoryStore();
    const result = await checkDuplicate("abc123", store);
    expect(result.is_duplicate).toBe(false);
    expect(result.sha256).toBe("abc123");
  });

  it("returns is_duplicate=true for known hash", async () => {
    const store = makeMemoryStore();
    await store.record("abc123", "docs/existing", "existing.pdf");
    const result = await checkDuplicate("abc123", store);
    expect(result.is_duplicate).toBe(true);
    expect(result.existing_slug).toBe("docs/existing");
    expect(result.existing_name).toBe("existing.pdf");
  });

  it("does not modify store during check", async () => {
    const store = makeMemoryStore();
    await checkDuplicate("new-hash", store);
    expect(store._data.size).toBe(0);
  });
});

// ── recordDuplicate ───────────────────────────────────────────────────

describe("recordDuplicate", () => {
  it("stores the hash with slug and name", async () => {
    const store = makeMemoryStore();
    await recordDuplicate("hash1", "docs/file1", "file1.pdf", store);
    expect(store._data.get("hash1")).toEqual({ slug: "docs/file1", name: "file1.pdf" });
  });

  it("overwrites existing entry with same hash", async () => {
    const store = makeMemoryStore();
    await recordDuplicate("hash1", "docs/file1", "file1.pdf", store);
    await recordDuplicate("hash1", "docs/file2", "file2.pdf", store);
    expect(store._data.get("hash1")).toEqual({ slug: "docs/file2", name: "file2.pdf" });
  });

  it("handles multiple different hashes", async () => {
    const store = makeMemoryStore();
    await recordDuplicate("hash1", "docs/a", "a.pdf", store);
    await recordDuplicate("hash2", "docs/b", "b.pdf", store);
    await recordDuplicate("hash3", "docs/c", "c.pdf", store);
    expect(store._data.size).toBe(3);
  });
});

// ── scanUploadWithDuplicateCheck ──────────────────────────────────────

describe("scanUploadWithDuplicateCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScanFile.mockResolvedValue({ ok: true });
  });

  it("rejects duplicate files with 409", async () => {
    const store = makeMemoryStore();
    const file = makeFile("duplicate content", "dup.pdf", "application/pdf");
    const buf = await file.arrayBuffer();
    const hash = computeSHA256(buf);
    await store.record(hash, "docs/existing", "existing.pdf");

    const result = await scanUploadWithDuplicateCheck(file, store);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toBe("duplicate_file");
      expect(result.message).toContain("existing.pdf");
    }
  });

  it("allows non-duplicate files", async () => {
    const store = makeMemoryStore();
    const file = makeFile("unique content here", "unique.pdf", "application/pdf");

    const result = await scanUploadWithDuplicateCheck(file, store);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.is_duplicate).toBe(false);
      expect(result.sha256).toHaveLength(64);
    }
  });

  it("still rejects invalid files (not a file)", async () => {
    const store = makeMemoryStore();
    const result = await scanUploadWithDuplicateCheck(null, store);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });

  it("still rejects oversized files before duplicate check", async () => {
    const store = makeMemoryStore();
    const big = makeBigFile(60, "huge.pdf", "application/pdf");
    const result = await scanUploadWithDuplicateCheck(big, store);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
    }
  });
});
