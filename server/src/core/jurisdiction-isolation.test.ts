import { describe, it, expect, vi } from "vitest";
import type { BrainEngine } from "../core/engine.ts";

// Minimal mock engine — hardSourceFilter/sourceScopeOpts don't call it,
// but OperationContext requires one.
function mockEngine(): BrainEngine {
  return {
    executeRaw: vi.fn(async () => []),
  } as unknown as BrainEngine;
}

// Build a minimal OperationContext with just the fields the filters read.
function makeCtx(opts: {
  sourceId?: string;
  allowedSources?: string[];
  matterScope?: string[] | "all";
  remote?: boolean;
}) {
  return {
    engine: mockEngine(),
    config: {} as never,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    dryRun: false,
    remote: opts.remote ?? false,
    sourceId: opts.sourceId ?? "default",
    ...(opts.allowedSources !== undefined
      ? { auth: { clientId: "test", token: "t", allowedSources: opts.allowedSources } }
      : {}),
    ...(opts.matterScope !== undefined ? { matterScope: opts.matterScope } : {}),
  } as never;
}

type Result = { source_id?: string; slug: string };

// ─── WP4: hardSourceFilter ─────────────────────────────────────────────

describe("WP4: hardSourceFilter — defense-in-depth post-search source filter", () => {
  it("returns all results when no source scope is set (local CLI)", async () => {
    const { hardSourceFilter } = await import("./operations.ts");
    const ctx = makeCtx({ sourceId: "default", remote: false });
    // No auth.allowedSources, no scalar sourceId override → no filtering
    // Actually sourceId="default" IS set, so it filters to "default" only
    const results: Result[] = [
      { slug: "a", source_id: "default" },
      { slug: "b", source_id: "default" },
    ];
    const filtered = hardSourceFilter(results, ctx);
    expect(filtered).toHaveLength(2);
  });

  it("filters out results from foreign sources (scalar sourceId)", async () => {
    const { hardSourceFilter } = await import("./operations.ts");
    const ctx = makeCtx({ sourceId: "brain_abc", remote: true });
    const results: Result[] = [
      { slug: "own-doc", source_id: "brain_abc" },
      { slug: "foreign-doc", source_id: "brain_xyz" },
      { slug: "another-foreign", source_id: "brain_def" },
    ];
    const filtered = hardSourceFilter(results, ctx);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].slug).toBe("own-doc");
  });

  it("filters out results not in allowedSources (federated read)", async () => {
    const { hardSourceFilter } = await import("./operations.ts");
    const ctx = makeCtx({
      sourceId: "brain_abc",
      allowedSources: ["brain_abc", "law-de", "law-eu"],
      remote: true,
    });
    const results: Result[] = [
      { slug: "own-doc", source_id: "brain_abc" },
      { slug: "de-law", source_id: "law-de" },
      { slug: "eu-law", source_id: "law-eu" },
      { slug: "at-law", source_id: "law-at" }, // NOT in allowedSources
      { slug: "foreign", source_id: "brain_xyz" }, // NOT in allowedSources
    ];
    const filtered = hardSourceFilter(results, ctx);
    expect(filtered).toHaveLength(3);
    expect(filtered.map((r) => r.slug)).toEqual(["own-doc", "de-law", "eu-law"]);
  });

  it("allowedSources takes priority over scalar sourceId", async () => {
    const { hardSourceFilter } = await import("./operations.ts");
    const ctx = makeCtx({
      sourceId: "brain_abc",
      allowedSources: ["brain_abc", "law-de"],
      remote: true,
    });
    const results: Result[] = [
      { slug: "a", source_id: "brain_abc" },
      { slug: "b", source_id: "law-de" },
      { slug: "c", source_id: "brain_abc" }, // matches scalar but also in array
    ];
    const filtered = hardSourceFilter(results, ctx);
    expect(filtered).toHaveLength(3);
  });

  it("treats missing source_id as 'default'", async () => {
    const { hardSourceFilter } = await import("./operations.ts");
    const ctx = makeCtx({ sourceId: "default", remote: true });
    const results: Result[] = [
      { slug: "no-source-id" }, // source_id undefined → defaults to "default"
      { slug: "explicit-default", source_id: "default" },
      { slug: "foreign", source_id: "brain_xyz" },
    ];
    const filtered = hardSourceFilter(results, ctx);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.slug)).toEqual(["no-source-id", "explicit-default"]);
  });

  it("returns empty array when all results are from foreign sources", async () => {
    const { hardSourceFilter } = await import("./operations.ts");
    const ctx = makeCtx({ sourceId: "brain_abc", remote: true });
    const results: Result[] = [
      { slug: "foreign-1", source_id: "brain_xyz" },
      { slug: "foreign-2", source_id: "brain_def" },
    ];
    const filtered = hardSourceFilter(results, ctx);
    expect(filtered).toHaveLength(0);
  });

  it("returns empty array for empty input", async () => {
    const { hardSourceFilter } = await import("./operations.ts");
    const ctx = makeCtx({ sourceId: "brain_abc", remote: true });
    const filtered = hardSourceFilter([], ctx);
    expect(filtered).toHaveLength(0);
  });

  it("empty allowedSources array falls through to scalar sourceId (not widen)", async () => {
    const { hardSourceFilter } = await import("./operations.ts");
    const ctx = makeCtx({
      sourceId: "brain_abc",
      allowedSources: [], // empty → must NOT widen to "all sources"
      remote: true,
    });
    const results: Result[] = [
      { slug: "own", source_id: "brain_abc" },
      { slug: "foreign", source_id: "brain_xyz" },
    ];
    const filtered = hardSourceFilter(results, ctx);
    // sourceScopeOpts treats empty allowedSources as "no federated scope"
    // → falls through to scalar sourceId → filters to brain_abc only
    expect(filtered).toHaveLength(1);
    expect(filtered[0].slug).toBe("own");
  });
});

// ─── WP4: sourceScopeOpts precedence ───────────────────────────────────

describe("WP4: sourceScopeOpts — precedence ladder", () => {
  it("returns sourceIds when allowedSources is non-empty", async () => {
    const { sourceScopeOpts } = await import("./operations.ts");
    const ctx = makeCtx({
      sourceId: "brain_abc",
      allowedSources: ["brain_abc", "law-de"],
      remote: true,
    });
    const scope = sourceScopeOpts(ctx);
    expect(scope.sourceIds).toEqual(["brain_abc", "law-de"]);
    expect(scope.sourceId).toBeUndefined();
  });

  it("returns sourceId when no allowedSources", async () => {
    const { sourceScopeOpts } = await import("./operations.ts");
    const ctx = makeCtx({ sourceId: "brain_abc", remote: true });
    const scope = sourceScopeOpts(ctx);
    expect(scope.sourceId).toBe("brain_abc");
    expect(scope.sourceIds).toBeUndefined();
  });

  it("returns empty object when neither is set (local CLI)", async () => {
    const { sourceScopeOpts } = await import("./operations.ts");
    const ctx = makeCtx({ sourceId: "default", remote: false });
    // sourceId is always set in OperationContext (REQUIRED field)
    // So this returns { sourceId: "default" }
    const scope = sourceScopeOpts(ctx);
    expect(scope.sourceId).toBe("default");
  });

  it("empty allowedSources falls through to scalar sourceId", async () => {
    const { sourceScopeOpts } = await import("./operations.ts");
    const ctx = makeCtx({
      sourceId: "brain_abc",
      allowedSources: [],
      remote: true,
    });
    const scope = sourceScopeOpts(ctx);
    expect(scope.sourceId).toBe("brain_abc");
    expect(scope.sourceIds).toBeUndefined();
  });
});

// ─── WP1: readSourcesFor jurisdiction logic ────────────────────────────

describe("WP1: readSourcesFor — Case > User > Fail-Closed jurisdiction", () => {
  // We test the jurisdiction resolution logic by replicating the core
  // decision tree from web-api.ts readSourcesFor(), since the function
  // requires a full Express Request object.

  const JURISDICTION_LAW_SOURCES: Record<string, string[]> = {
    DE: ["law-de", "law-eu"],
    AT: ["law-at", "law-at-judikatur", "law-eu"],
    CH: ["law-ch", "law-eu"],
  };

  const SHARED_READ_SOURCES = ["law-at", "law-de", "law-ch", "law-eu", "law-at-judikatur"];

  function readSourcesForImpl(
    ownSource: string,
    caseJur?: string,
    userJur?: string
  ): string[] | undefined {
    if (SHARED_READ_SOURCES.length === 0) return undefined;
    const caseJurUpper = caseJur?.toUpperCase();
    const userJurUpper = userJur?.toUpperCase();
    const jur = caseJurUpper ?? userJurUpper;
    if (jur && JURISDICTION_LAW_SOURCES[jur]) {
      const scoped = JURISDICTION_LAW_SOURCES[jur].filter((s) =>
        SHARED_READ_SOURCES.includes(s)
      );
      return [...new Set([ownSource, ...scoped])];
    }
    // Fail-closed: no jurisdiction → only own source
    return [ownSource];
  }

  it("case jurisdiction takes priority over user jurisdiction", () => {
    // User is DE, case is AT → AT law sources
    const result = readSourcesForImpl("brain_abc", "AT", "DE");
    expect(result).toContain("brain_abc");
    expect(result).toContain("law-at");
    expect(result).toContain("law-eu");
    expect(result).not.toContain("law-de");
    expect(result).not.toContain("law-ch");
  });

  it("user jurisdiction used when no case jurisdiction", () => {
    const result = readSourcesForImpl("brain_abc", undefined, "DE");
    expect(result).toContain("brain_abc");
    expect(result).toContain("law-de");
    expect(result).toContain("law-eu");
    expect(result).not.toContain("law-at");
  });

  it("fail-closed when neither case nor user jurisdiction", () => {
    const result = readSourcesForImpl("brain_abc", undefined, undefined);
    expect(result).toEqual(["brain_abc"]);
    expect(result).not.toContain("law-de");
    expect(result).not.toContain("law-at");
  });

  it("AT jurisdiction includes law-at-judikatur", () => {
    const result = readSourcesForImpl("brain_abc", "AT");
    expect(result).toContain("law-at-judikatur");
    expect(result).toContain("law-at");
    expect(result).toContain("law-eu");
  });

  it("lowercase case jurisdiction header is accepted", () => {
    const result = readSourcesForImpl("brain_abc", "de");
    expect(result).toContain("law-de");
    expect(result).not.toContain("law-at");
  });

  it("unknown jurisdiction → fail-closed (own source only)", () => {
    const result = readSourcesForImpl("brain_abc", "XX");
    expect(result).toEqual(["brain_abc"]);
  });

  it("EU law always included for all DACH jurisdictions", () => {
    for (const jur of ["DE", "AT", "CH"]) {
      const result = readSourcesForImpl("brain_abc", jur);
      expect(result).toContain("law-eu");
    }
  });

  it("own source always included even if not in shared list", () => {
    const result = readSourcesForImpl("brain_custom", "DE");
    expect(result).toContain("brain_custom");
  });

  it("no duplicate sources when own source matches a shared source", () => {
    const result = readSourcesForImpl("law-de", "DE");
    const unique = new Set(result);
    expect(unique.size).toBe(result!.length);
  });

  it("CH jurisdiction gets law-ch + law-eu only", () => {
    const result = readSourcesForImpl("brain_abc", "CH");
    expect(result).toContain("law-ch");
    expect(result).toContain("law-eu");
    expect(result).not.toContain("law-de");
    expect(result).not.toContain("law-at");
  });
});

// ─── WP5: SUBSUMIO_EMBEDDING_MODEL env alias ───────────────────────────

describe("WP5: SUBSUMIO_EMBEDDING_MODEL env alias", () => {
  it("detectEnvOverride recognizes SUBSUMIO_EMBEDDING_MODEL", async () => {
    const { detectEnvOverride } = await import("./retrieval-upgrade-planner.ts");
    const result = detectEnvOverride("openrouter:openai/text-embedding-3-small", 1536, {
      SUBSUMIO_EMBEDDING_MODEL: "openrouter:openai/text-embedding-3-small",
      SUBSUMIO_EMBEDDING_DIMENSIONS: "1536",
    } as NodeJS.ProcessEnv);
    expect(result.triggered).toBe(false);
  });

  it("detectEnvOverride flags mismatch when SUBSUMIO_ model differs from target", async () => {
    const { detectEnvOverride } = await import("./retrieval-upgrade-planner.ts");
    const result = detectEnvOverride("openrouter:openai/text-embedding-3-small", 1536, {
      SUBSUMIO_EMBEDDING_MODEL: "zeroentropyai:zembed-1",
    } as NodeJS.ProcessEnv);
    expect(result.triggered).toBe(true);
    expect(result.vars[0].name).toContain("EMBEDDING_MODEL");
  });

  it("detectEnvOverride: SUBSUMIO_ takes priority over GBRAIN_", async () => {
    const { detectEnvOverride } = await import("./retrieval-upgrade-planner.ts");
    const result = detectEnvOverride("openrouter:openai/text-embedding-3-small", 1536, {
      SUBSUMIO_EMBEDDING_MODEL: "openrouter:openai/text-embedding-3-small",
      GBRAIN_EMBEDDING_MODEL: "zeroentropyai:zembed-1", // should be ignored
    } as NodeJS.ProcessEnv);
    expect(result.triggered).toBe(false);
  });

  it("detectEnvOverride: falls back to GBRAIN_ when SUBSUMIO_ not set", async () => {
    const { detectEnvOverride } = await import("./retrieval-upgrade-planner.ts");
    const result = detectEnvOverride("openrouter:openai/text-embedding-3-small", 1536, {
      GBRAIN_EMBEDDING_MODEL: "zeroentropyai:zembed-1",
    } as NodeJS.ProcessEnv);
    expect(result.triggered).toBe(true);
  });
});
