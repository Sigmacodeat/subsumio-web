import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calculateFreshness,
  hashContent,
  scanCorpusFile,
  computeCorpusDiff,
  buildJudgementApiEntries,
  buildSourceRegistry,
  findSourceForCitation,
  provenanceFromEntry,
  type SourceRegistryEntry,
  type CorpusDiffEntry,
} from "@/lib/source-registry";

// ── calculateFreshness ────────────────────────────────────────────────

describe("calculateFreshness", () => {
  it("returns 'unknown' when lastSyncAt is null", () => {
    const result = calculateFreshness(null, 24);
    expect(result.status).toBe("unknown");
    expect(result.freshness_hours).toBeNull();
  });

  it("returns 'fresh' when within interval", () => {
    const recent = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(); // 5h ago
    const result = calculateFreshness(recent, 24);
    expect(result.status).toBe("fresh");
    expect(result.freshness_hours).toBe(5);
  });

  it("returns 'stale' when beyond interval", () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48h ago
    const result = calculateFreshness(old, 24);
    expect(result.status).toBe("stale");
    expect(result.freshness_hours).toBe(48);
  });

  it("returns 'fresh' when sync is in the future (clock skew)", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h in future
    const result = calculateFreshness(future, 24);
    expect(result.status).toBe("fresh");
    expect(result.freshness_hours).toBe(0);
  });

  it("handles exact boundary correctly", () => {
    const exact = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago
    const result = calculateFreshness(exact, 24);
    expect(result.status).toBe("fresh");
    expect(result.freshness_hours).toBe(24);
  });

  it("returns 'stale' at 25h with 24h interval", () => {
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const result = calculateFreshness(stale, 24);
    expect(result.status).toBe("stale");
    expect(result.freshness_hours).toBe(25);
  });
});

// ── scanCorpusFile ────────────────────────────────────────────────────

describe("scanCorpusFile", () => {
  it("returns exists=false for non-existent file", async () => {
    const result = await scanCorpusFile("/nonexistent/path/file.md");
    expect(result.exists).toBe(false);
    expect(result.document_count).toBe(0);
    expect(result.hash).toBeNull();
    expect(result.size).toBe(0);
  });

  it("returns exists=true with hash and document_count for valid file", async () => {
    // Use a known corpus file
    const path = await import("node:path");
    const corpusPath = path.join(process.cwd(), "law-corpus", "de", "bgb.md");
    const result = await scanCorpusFile(corpusPath);
    expect(result.exists).toBe(true);
    expect(result.hash).toMatch(/^[a-f0-9]{16}$/);
    expect(result.document_count).toBeGreaterThan(0);
    expect(result.size).toBeGreaterThan(0);
  });
});

// ── hashContent ───────────────────────────────────────────────────────

describe("hashContent", () => {
  it("produces a 16-char hex hash", () => {
    const hash = hashContent("test content");
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it("is deterministic for same input", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
  });

  it("differs for different input", () => {
    expect(hashContent("hello")).not.toBe(hashContent("world"));
  });

  it("handles empty string", () => {
    const hash = hashContent("");
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });
});

// ── computeCorpusDiff ─────────────────────────────────────────────────

describe("computeCorpusDiff", () => {
  it("detects added entries", async () => {
    const current = { bgb: "hash1", zpo: "hash2" };
    const previous: Record<string, string> = {};
    const diffs = await computeCorpusDiff(current, previous);
    expect(diffs).toHaveLength(2);
    expect(diffs.every((d) => d.change_type === "added")).toBe(true);
  });

  it("detects modified entries", async () => {
    const current = { bgb: "newHash" };
    const previous = { bgb: "oldHash" };
    const diffs = await computeCorpusDiff(current, previous);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].change_type).toBe("modified");
    expect(diffs[0].old_hash).toBe("oldHash");
    expect(diffs[0].new_hash).toBe("newHash");
  });

  it("detects removed entries", async () => {
    const current: Record<string, string> = {};
    const previous = { bgb: "hash1" };
    const diffs = await computeCorpusDiff(current, previous);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].change_type).toBe("removed");
    expect(diffs[0].old_hash).toBe("hash1");
  });

  it("returns empty when no changes", async () => {
    const current = { bgb: "hash1" };
    const previous = { bgb: "hash1" };
    const diffs = await computeCorpusDiff(current, previous);
    expect(diffs).toHaveLength(0);
  });

  it("handles mixed changes", async () => {
    const current = { bgb: "newHash", estg: "hashE" };
    const previous = { bgb: "oldHash", zpo: "hashZ" };
    const diffs = await computeCorpusDiff(current, previous);
    expect(diffs).toHaveLength(3);
    const types = diffs.map((d) => d.change_type).sort();
    expect(types).toEqual(["added", "modified", "removed"]);
  });
});

// ── buildJudgementApiEntries ──────────────────────────────────────────

describe("buildJudgementApiEntries", () => {
  it("returns 4 API entries (AT, DE, CH, EU)", () => {
    const entries = buildJudgementApiEntries();
    expect(entries).toHaveLength(4);
    const ids = entries.map((e) => e.id);
    expect(ids).toContain("ris-ogd-at");
    expect(ids).toContain("openlegaldata-de");
    expect(ids).toContain("opencaselaw-ch");
    expect(ids).toContain("eur-lex-eu");
  });

  it("returns 'unknown' status when no sync status provided", () => {
    const entries = buildJudgementApiEntries();
    for (const e of entries) {
      expect(e.status).toBe("unknown");
      expect(e.last_sync_at).toBeNull();
    }
  });

  it("returns 'fresh' when sync was recent", () => {
    const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const entries = buildJudgementApiEntries({
      "ris-ogd-at": { last_sync_at: recent },
    });
    const at = entries.find((e) => e.id === "ris-ogd-at");
    expect(at?.status).toBe("fresh");
    expect(at?.last_sync_at).toBe(recent);
  });

  it("returns 'error' when last_error is set", () => {
    const entries = buildJudgementApiEntries({
      "ris-ogd-at": { last_sync_at: new Date().toISOString(), last_error: "Connection refused" },
    });
    const at = entries.find((e) => e.id === "ris-ogd-at");
    expect(at?.status).toBe("error");
    expect(at?.last_error).toBe("Connection refused");
  });

  it("sets correct authority tiers", () => {
    const entries = buildJudgementApiEntries();
    const at = entries.find((e) => e.id === "ris-ogd-at");
    const de = entries.find((e) => e.id === "openlegaldata-de");
    const ch = entries.find((e) => e.id === "opencaselaw-ch");
    expect(at?.authority_tier).toBe("official");
    expect(de?.authority_tier).toBe("community");
    expect(ch?.authority_tier).toBe("semi-official");
  });

  it("sets correct jurisdictions", () => {
    const entries = buildJudgementApiEntries();
    const at = entries.find((e) => e.id === "ris-ogd-at");
    const de = entries.find((e) => e.id === "openlegaldata-de");
    const ch = entries.find((e) => e.id === "opencaselaw-ch");
    expect(at?.jurisdiction).toBe("AT");
    expect(de?.jurisdiction).toBe("DE");
    expect(ch?.jurisdiction).toBe("CH");
  });

  it("returns 'stale' when sync is beyond interval", () => {
    const oldSync = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(); // 49h ago, interval 48h
    const entries = buildJudgementApiEntries({
      "openlegaldata-de": { last_sync_at: oldSync },
    });
    const de = entries.find((e) => e.id === "openlegaldata-de");
    expect(de?.status).toBe("stale");
    expect(de?.freshness_hours).toBe(49);
  });

  it("sets correct auto_sync_interval_hours", () => {
    const entries = buildJudgementApiEntries();
    const at = entries.find((e) => e.id === "ris-ogd-at");
    const de = entries.find((e) => e.id === "openlegaldata-de");
    expect(at?.auto_sync_interval_hours).toBe(24);
    expect(de?.auto_sync_interval_hours).toBe(48);
  });

  it("sets api_endpoint for each entry", () => {
    const entries = buildJudgementApiEntries();
    for (const e of entries) {
      expect(e.api_endpoint).toBeDefined();
      expect(e.api_endpoint).toMatch(/^https?:\/\//);
    }
  });

  it("all entries are enabled by default", () => {
    const entries = buildJudgementApiEntries();
    for (const e of entries) {
      expect(e.enabled).toBe(true);
    }
  });
});

// ── buildSourceRegistry (integration) ─────────────────────────────────

describe("buildSourceRegistry", () => {
  it("returns response with sources, total, and counts", async () => {
    const registry = await buildSourceRegistry();
    expect(registry.sources.length).toBeGreaterThan(0);
    expect(registry.total).toBe(registry.sources.length);
    expect(registry.fresh + registry.stale + registry.error + registry.unknown).toBeLessThanOrEqual(
      registry.total
    );
    expect(registry.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("includes both statute_corpus and judgement_api types", async () => {
    const registry = await buildSourceRegistry();
    const types = new Set(registry.sources.map((s) => s.type));
    expect(types.has("statute_corpus")).toBe(true);
    expect(types.has("judgement_api")).toBe(true);
  });

  it("includes DE, AT, and CH jurisdictions", async () => {
    const registry = await buildSourceRegistry();
    const jurisdictions = new Set(registry.sources.map((s) => s.jurisdiction));
    expect(jurisdictions.has("DE")).toBe(true);
    expect(jurisdictions.has("AT")).toBe(true);
    expect(jurisdictions.has("CH")).toBe(true);
  });

  it("statute entries have file_path set", async () => {
    const registry = await buildSourceRegistry();
    const statutes = registry.sources.filter((s) => s.type === "statute_corpus");
    for (const s of statutes) {
      expect(s.file_path).toBeDefined();
    }
  });

  it("judgement entries have api_endpoint set", async () => {
    const registry = await buildSourceRegistry();
    const apis = registry.sources.filter((s) => s.type === "judgement_api");
    for (const a of apis) {
      expect(a.api_endpoint).toBeDefined();
    }
  });
});

// ── findSourceForCitation ─────────────────────────────────────────────

describe("findSourceForCitation", () => {
  const mockSources: SourceRegistryEntry[] = [
    {
      id: "corpus-bgb",
      type: "statute_corpus",
      label: "BGB",
      jurisdiction: "DE",
      authority_tier: "official",
      license: "gemeinfrei",
      status: "fresh",
      last_sync_at: new Date().toISOString(),
      freshness_hours: 1,
      auto_sync_interval_hours: 720,
      document_count: 2385,
      enabled: true,
    },
    {
      id: "corpus-abgb",
      type: "statute_corpus",
      label: "ABGB",
      jurisdiction: "AT",
      authority_tier: "official",
      license: "gemeinfrei",
      status: "fresh",
      last_sync_at: new Date().toISOString(),
      freshness_hours: 1,
      auto_sync_interval_hours: 720,
      document_count: 1500,
      enabled: true,
    },
  ];

  it("finds BGB by code", () => {
    const provenance = findSourceForCitation(mockSources, "BGB");
    expect(provenance).not.toBeNull();
    expect(provenance?.source_id).toBe("corpus-bgb");
    expect(provenance?.source_label).toBe("BGB");
  });

  it("finds ABGB by code", () => {
    const provenance = findSourceForCitation(mockSources, "ABGB");
    expect(provenance).not.toBeNull();
    expect(provenance?.source_id).toBe("corpus-abgb");
  });

  it("returns null for unknown code", () => {
    const provenance = findSourceForCitation(mockSources, "XYZ");
    expect(provenance).toBeNull();
  });

  it("filters by jurisdiction when provided", () => {
    const provenance = findSourceForCitation(mockSources, "BGB", "DE");
    expect(provenance).not.toBeNull();
    expect(provenance?.jurisdiction).toBe("DE");
  });

  it("returns null when jurisdiction doesn't match", () => {
    const provenance = findSourceForCitation(mockSources, "BGB", "AT");
    expect(provenance).toBeNull();
  });

  it("handles lowercase code", () => {
    const provenance = findSourceForCitation(mockSources, "bgb");
    expect(provenance).not.toBeNull();
    expect(provenance?.source_id).toBe("corpus-bgb");
  });
});

// ── provenanceFromEntry ───────────────────────────────────────────────

describe("provenanceFromEntry", () => {
  it("extracts provenance fields from entry", () => {
    const entry: SourceRegistryEntry = {
      id: "corpus-bgb",
      type: "statute_corpus",
      label: "BGB",
      jurisdiction: "DE",
      authority_tier: "official",
      license: "gemeinfrei",
      status: "fresh",
      last_sync_at: "2026-06-20T10:00:00Z",
      freshness_hours: 5,
      auto_sync_interval_hours: 720,
      document_count: 2385,
      enabled: true,
    };
    const provenance = provenanceFromEntry(entry);
    expect(provenance.source_id).toBe("corpus-bgb");
    expect(provenance.source_label).toBe("BGB");
    expect(provenance.jurisdiction).toBe("DE");
    expect(provenance.authority_tier).toBe("official");
    expect(provenance.last_sync_at).toBe("2026-06-20T10:00:00Z");
    expect(provenance.freshness_status).toBe("fresh");
  });
});
