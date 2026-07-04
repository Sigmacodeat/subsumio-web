// @vitest-environment node
/**
 * Pipeline C: Upload → Virus Scan → SHA256 → Duplicate Check → AI Analysis
 * =====================================================================
 * Integration test chaining the upload security pipeline with AI deadline
 * detection, verifying that a clean uploaded document flows through all
 * security stages and its content is correctly analyzed.
 *
 * Stages:
 *   1. scanUpload              — validate, sanitize, virus scan, SHA256
 *   2. computeSHA256           — verify hash is deterministic
 *   3. checkDuplicate          — check against in-memory store
 *   4. recordDuplicate         — record after saving
 *   5. scanUploadWithDuplicateCheck — full pipeline with dup check
 *   6. detectDeadlines         — AI deadline extraction from uploaded content
 *
 * Note: scanFile uses real magic-byte validation (no ClamAV in test env).
 * We provide real PDF magic bytes so the MIME mismatch check passes.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/virus-scan", () => ({
  scanFile: vi.fn(async () => ({ ok: true })),
}));

import {
  scanUpload,
  computeSHA256,
  checkDuplicate,
  recordDuplicate,
  scanUploadWithDuplicateCheck,
  type DuplicateStore,
} from "@/lib/upload-pipeline";
import { scanFile } from "@/lib/virus-scan";
import { detectDeadlines } from "@/lib/ai-deadline-detect";

const mockScanFile = vi.mocked(scanFile);

// ── Helpers ────────────────────────────────────────────────────────────

function makePdfFile(content: string, name = "document.pdf"): File {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(content);
  // Real PDF header: %PDF-1.4
  const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const combined = new Uint8Array(pdfHeader.length + textBytes.length);
  combined.set(pdfHeader, 0);
  combined.set(textBytes, pdfHeader.length);
  const ab = combined.buffer;
  const file = new File([ab], name, { type: "application/pdf" });
  file.arrayBuffer = vi.fn(async () => ab);
  return file;
}

function makeMemoryStore(): DuplicateStore & {
  _data: Map<string, { slug: string; name: string }>;
} {
  const data = new Map<string, { slug: string; name: string }>();
  return {
    _data: data,
    lookup: async (sha256: string) => data.get(sha256) ?? null,
    record: async (sha256: string, slug: string, name: string) => {
      data.set(sha256, { slug, name });
    },
  };
}

// Legal document with deadlines for AI detection
const LEGAL_CONTENT = `
Klageerwiderung der Beklagten gegen die Klage des Klägers.

Berufung gegen das Ersturteil muss bis 15.04.2026 eingelegt werden.
Zahlungsfrist gemäß § 286 BGB endet am 31.03.2026.

Die Verjährungsfrist nach § 195 BGB beträgt drei Jahre.
`;

// ── Pipeline ───────────────────────────────────────────────────────────

describe("Pipeline C: Upload → Scan → SHA256 → Duplicate → AI Analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScanFile.mockResolvedValue({ ok: true });
  });

  test("full pipeline: clean PDF upload through AI deadline detection", async () => {
    // ── Stage 1: Upload validation + virus scan ───────────────────────
    const file = makePdfFile(LEGAL_CONTENT, "klageerwiderung.pdf");
    const scanResult = await scanUpload(file);

    expect(scanResult.ok).toBe(true);
    if (!scanResult.ok) return;

    expect(scanResult.cleanName).toBe("klageerwiderung.pdf");
    expect(scanResult.mimeType).toBe("application/pdf");
    expect(scanResult.buffer).toBeInstanceOf(ArrayBuffer);
    expect(mockScanFile).toHaveBeenCalledOnce();

    // ── Stage 2: SHA256 hash ──────────────────────────────────────────
    expect(scanResult.sha256).toHaveLength(64);
    expect(scanResult.sha256).toMatch(/^[0-9a-f]+$/);

    // Hash should be deterministic
    const recomputed = computeSHA256(scanResult.buffer);
    expect(recomputed).toBe(scanResult.sha256);

    // ── Stage 3: Duplicate check (not a duplicate) ────────────────────
    const store = makeMemoryStore();
    const dupCheck = await checkDuplicate(scanResult.sha256, store);
    expect(dupCheck.is_duplicate).toBe(false);

    // ── Stage 4: Record in store ──────────────────────────────────────
    const docSlug = "docs/cases/2026-001/klageerwiderung.pdf";
    await recordDuplicate(scanResult.sha256, docSlug, "klageerwiderung.pdf", store);
    expect(store._data.size).toBe(1);

    // Subsequent check should now find it as duplicate
    const dupCheck2 = await checkDuplicate(scanResult.sha256, store);
    expect(dupCheck2.is_duplicate).toBe(true);
    expect(dupCheck2.existing_slug).toBe(docSlug);
    expect(dupCheck2.existing_name).toBe("klageerwiderung.pdf");

    // ── Stage 5: AI deadline detection from uploaded content ──────────
    const detected = detectDeadlines(LEGAL_CONTENT);

    // Should detect deadlines by date (absolute_date_de rule)
    const byDate = detected.find((d) => d.date === "2026-04-15");
    expect(byDate).toBeDefined();
    expect(byDate!.type).toBe("absolute_deadline");
    expect(byDate!.confidence).toBe("high");

    // Should also detect payment_deadline (Zahlungsfrist)
    const payment = detected.find((d) => d.type === "payment_deadline");
    expect(payment).toBeDefined();
    expect(payment!.date).toBe("2026-03-31");
  });

  test("pipeline: duplicate upload rejected with 409", async () => {
    const store = makeMemoryStore();
    const file = makePdfFile("existing content", "existing.pdf");

    // First upload: succeeds
    const result1 = await scanUploadWithDuplicateCheck(file, store);
    expect(result1.ok).toBe(true);
    if (!result1.ok) return;

    // Record the hash
    await recordDuplicate(result1.sha256, "docs/existing.pdf", "existing.pdf", store);

    // Second upload of same content: rejected as duplicate
    const file2 = makePdfFile("existing content", "copy.pdf");
    const result2 = await scanUploadWithDuplicateCheck(file2, store);
    expect(result2.ok).toBe(false);
    if (result2.ok) return;

    expect(result2.status).toBe(409);
    expect(result2.error).toBe("duplicate_file");
    expect(result2.message).toContain("existing.pdf");
  });

  test("pipeline: infected file blocked before AI analysis", async () => {
    mockScanFile.mockResolvedValue({
      ok: false,
      reason: "clamav_infected",
      signature: "Eicar-Test-Signature",
    });

    const file = makePdfFile("infected content", "malware.pdf");
    const result = await scanUpload(file);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe("clamav_infected");
    expect(result.status).toBe(422);
    expect(result.message).toContain("Eicar-Test-Signature");

    // AI analysis should never run on blocked files
    // (In real code, we'd return the error before reaching detectDeadlines)
  });

  test("pipeline: path traversal filename sanitized", async () => {
    const file = makePdfFile("safe content", "../../../etc/passwd.pdf");
    const result = await scanUpload(file);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.cleanName).not.toContain("/");
    // Sanitizer keeps dots (allowed chars), but strips path separators
    expect(result.cleanName).toMatch(/^[a-zA-Z0-9._-]+$/);
  });

  test("pipeline: different content produces different SHA256 hashes", async () => {
    const file1 = makePdfFile("content A", "a.pdf");
    const file2 = makePdfFile("content B", "b.pdf");

    const r1 = await scanUpload(file1);
    const r2 = await scanUpload(file2);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    expect(r1.sha256).not.toBe(r2.sha256);
  });

  test("pipeline: AI analysis detects multiple deadline types from uploaded legal document", async () => {
    const complexDoc = `
    Rechtsanwalt Dr. Schmidt
    Akte 2026-001: Müller GmbH vs. Schuldner AG

    1. Berufung gegen Ersturteil bis 15.04.2026
    2. Klageerwiderung nach § 276 ZPO binnen 14 Tagen
    3. Zahlungsfrist endet am 31.03.2026
    `;

    const file = makePdfFile(complexDoc, "complex-case.pdf");
    const result = await scanUpload(file);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const detected = detectDeadlines(complexDoc);
    expect(detected.length).toBeGreaterThanOrEqual(2);

    // Verify each detected deadline has required fields
    for (const d of detected) {
      expect(d.type).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(d.confidence).toBeTruthy();
      expect(d.matchedRule).toBeTruthy();
    }
  });
});
