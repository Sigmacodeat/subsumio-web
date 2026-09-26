/**
 * EU-only for embeddings (KI1 E5 / E6, KI3-16).
 *
 * A firm's "Nur EU" must reach the embedding touchpoint exactly like chat:
 * its documents and its search queries are client data and never go to a
 * non-EU embedding provider. The document then stays keyword-searchable and
 * is visibly marked (`embedding_status: blocked_eu_only`); a search runs
 * keyword-only and says so. The public statute corpus (`law-*`) is not
 * client data and keeps its (deployment-configured) provider.
 *
 * The standalone embed worker embeds through the gateway (OpenRouter
 * privacy preferences zdr/deny, EU policy) and only the corpus by default.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { resetPgliteState } from "./helpers/reset-pglite.ts";
import {
  __setEmbedTransportForTests,
  configureGateway,
  embed,
  embedQuery,
  resetGateway,
} from "../src/core/ai/gateway.ts";
import {
  __resetEuPolicyLogForTests,
  assertEuEmbedding,
  embeddingOriginOfSource,
  EMBEDDING_STATUS_BLOCKED_EU_ONLY,
  EuResidencyError,
} from "../src/core/ai/eu-policy.ts";
import {
  __resetEuSourceCacheForTests,
  runWithRequestEuOnly,
} from "../src/core/ai/request-eu-policy.ts";
import { embedStaleForSource } from "../src/core/embed-stale.ts";
import { importFromContent } from "../src/core/import-file.ts";
import { hybridSearch } from "../src/core/search/hybrid.ts";
import type { HybridSearchMeta } from "../src/core/types.ts";
import {
  candidateParams,
  candidateQuery,
  embedForSource,
  resolveSourceScope,
} from "../scripts/embed-worker-standalone.ts";

const NON_EU = "openrouter:openai/text-embedding-3-small";
const EU = { SUBSUMIO_EU_ONLY: "1" };

let sent: string[][] = [];
function installTransport(): void {
  __setEmbedTransportForTests((async ({ values }: { values: string[] }) => {
    sent.push(values);
    return { embeddings: values.map(() => new Array(1536).fill(0.1)), usage: { tokens: 1 } };
  }) as never);
}

function configure(env: Record<string, string> = {}): void {
  configureGateway({
    embedding_model: NON_EU,
    embedding_dimensions: 1536,
    env: { OPENROUTER_API_KEY: "sk-or-test", ...env },
  });
}

beforeEach(() => {
  resetGateway();
  __resetEuPolicyLogForTests();
  __resetEuSourceCacheForTests();
  sent = [];
});
afterEach(() => {
  __setEmbedTransportForTests(null);
  resetGateway();
});

describe("assertEuEmbedding: whose text decides", () => {
  it("origin by source: law-* is the public corpus, everything else client data", () => {
    expect(embeddingOriginOfSource("law-at")).toBe("public_corpus");
    expect(embeddingOriginOfSource("law-at-judikatur-ogh")).toBe("public_corpus");
    expect(embeddingOriginOfSource("kanzlei-a")).toBe("client");
    expect(embeddingOriginOfSource("default")).toBe("client");
    expect(embeddingOriginOfSource(undefined)).toBeUndefined();
  });

  it("firm scope: documents of unknown or client origin and queries are refused", () => {
    const firm = { firmScope: true };
    expect(() => assertEuEmbedding(NON_EU, "document", EU, firm)).toThrow(EuResidencyError);
    expect(() => assertEuEmbedding(NON_EU, "document", EU, { ...firm, origin: "client" })).toThrow(
      EuResidencyError
    );
    expect(() => assertEuEmbedding(NON_EU, "query", EU, firm)).toThrow(EuResidencyError);
  });

  it("public corpus stays on its provider unless SUBSUMIO_EU_ONLY_EMBEDDINGS=1", () => {
    const corpus = { origin: "public_corpus" as const };
    expect(() => assertEuEmbedding(NON_EU, "document", EU, corpus)).not.toThrow();
    expect(() =>
      assertEuEmbedding(NON_EU, "document", EU, { ...corpus, firmScope: true })
    ).not.toThrow();
    expect(() =>
      assertEuEmbedding(NON_EU, "document", { ...EU, SUBSUMIO_EU_ONLY_EMBEDDINGS: "1" }, corpus)
    ).toThrow(EuResidencyError);
  });

  it("deployment switch: client documents refused, unlabelled bulk runs keep the corpus rule", () => {
    expect(() => assertEuEmbedding(NON_EU, "document", EU, { origin: "client" })).toThrow(
      EuResidencyError
    );
    expect(() => assertEuEmbedding(NON_EU, "document", EU, {})).not.toThrow();
  });

  it("switch off: nothing refused; EU provider always allowed", () => {
    expect(() => assertEuEmbedding(NON_EU, "query", {}, { firmScope: false })).not.toThrow();
    expect(() =>
      assertEuEmbedding("mistral:mistral-embed", "query", EU, { firmScope: true })
    ).not.toThrow();
  });
});

describe("gateway embed under a firm's EU-only scope", () => {
  it("document embedding to a non-EU model is refused before anything is sent", async () => {
    installTransport();
    configure(); // deployment switch OFF — only the firm demands EU
    await expect(
      runWithRequestEuOnly(() => embed(["Schriftsatz Mandant"], { sourceId: "kanzlei-a" }))
    ).rejects.toBeInstanceOf(EuResidencyError);
    await expect(runWithRequestEuOnly(() => embed(["ohne Quelle"]))).rejects.toBeInstanceOf(
      EuResidencyError
    );
    await expect(
      runWithRequestEuOnly(() => embedQuery("Mietzins Schimmel"))
    ).rejects.toBeInstanceOf(EuResidencyError);
    expect(sent).toEqual([]);
  });

  it("public corpus text is still embedded inside the firm scope", async () => {
    installTransport();
    configure();
    await runWithRequestEuOnly(() => embed(["§ 1295 ABGB"], { sourceId: "law-at" }));
    expect(sent).toEqual([["§ 1295 ABGB"]]);
  });

  it("outside the scope (no EU demand) nothing changes", async () => {
    installTransport();
    configure();
    await embed(["x"], { sourceId: "kanzlei-a" });
    await embedQuery("y");
    expect(sent.length).toBe(2);
  });
});

describe("pipelines with a PGLite brain", () => {
  let engine: PGLiteEngine;
  beforeAll(async () => {
    engine = new PGLiteEngine();
    await engine.connect({});
    await engine.initSchema();
  }, 30000);
  afterAll(async () => {
    await engine.disconnect();
  });
  beforeEach(async () => {
    await resetPgliteState(engine);
    for (const id of ["kanzlei-eu", "law-at"]) {
      await engine.executeRaw(
        `INSERT INTO sources (id, name) VALUES ($1, $1) ON CONFLICT (id) DO NOTHING`,
        [id]
      );
    }
    // The firm demanded "Nur EU" (remembered per source by the web API).
    await engine.setConfig("policy.eu_only_sources", JSON.stringify(["kanzlei-eu"]));
    __resetEuSourceCacheForTests();
  });

  async function frontmatterOf(sourceId: string, slug: string): Promise<Record<string, unknown>> {
    const rows = await engine.executeRaw<{ frontmatter: Record<string, unknown> }>(
      `SELECT frontmatter FROM pages WHERE source_id = $1 AND slug = $2`,
      [sourceId, slug]
    );
    return rows[0]!.frontmatter;
  }

  async function vectorsOf(sourceId: string, slug: string): Promise<number> {
    const rows = await engine.executeRaw<{ n: number }>(
      `SELECT count(c.embedding)::int AS n FROM content_chunks c JOIN pages p ON p.id = c.page_id
        WHERE p.source_id = $1 AND p.slug = $2`,
      [sourceId, slug]
    );
    return rows[0]!.n;
  }

  it("upload import: firm document lands keyword-searchable, marked, nothing sent", async () => {
    installTransport();
    configure();
    const res = await importFromContent(
      engine,
      "akten/schriftsatz-1",
      "---\ntitle: Klage Mietzinsminderung\n---\n\nDie Mieterin begehrt Mietzinsminderung wegen Schimmelbefall.\n",
      { sourceId: "kanzlei-eu" }
    );
    expect(res.status).toBe("imported");
    expect(res.embedding_blocked).toBe("eu_only");
    expect(sent).toEqual([]);
    const fm = await frontmatterOf("kanzlei-eu", "akten/schriftsatz-1");
    expect(fm.embedding_status).toBe(EMBEDDING_STATUS_BLOCKED_EU_ONLY);
    expect(String(fm.embedding_error)).toContain("eu_only_policy");
    expect(await vectorsOf("kanzlei-eu", "akten/schriftsatz-1")).toBe(0);
    const hits = await engine.searchKeyword("Schimmelbefall", { sourceId: "kanzlei-eu" });
    expect(hits.map((h) => h.slug)).toContain("akten/schriftsatz-1");
  });

  it("corpus import in the same deployment is embedded as before", async () => {
    installTransport();
    configure();
    const res = await importFromContent(
      engine,
      "abgb-1295",
      "---\ntitle: ABGB § 1295\n---\n\nJedermann ist berechtigt, von dem Beschädiger den Ersatz zu fordern.\n",
      { sourceId: "law-at" }
    );
    expect(res.embedding_blocked).toBeUndefined();
    expect(sent.length).toBe(1);
    expect(await vectorsOf("law-at", "abgb-1295")).toBeGreaterThan(0);
  });

  it("embed backfill outside any request: firm pages blocked + marked, not retried silently", async () => {
    installTransport();
    configure();
    await importFromContent(engine, "akten/brief", "Brief an Gegenseite wegen Räumung.\n", {
      sourceId: "kanzlei-eu",
      noEmbed: true,
    });
    const result = await embedStaleForSource(engine, "kanzlei-eu");
    expect(result.blockedEuOnly).toBe(1);
    expect(result.embedded).toBe(0);
    expect(sent).toEqual([]);
    const fm = await frontmatterOf("kanzlei-eu", "akten/brief");
    expect(fm.embedding_status).toBe(EMBEDDING_STATUS_BLOCKED_EU_ONLY);
  });

  it("search of an EU-only firm falls back to keyword-only with a visible flag", async () => {
    await importFromContent(
      engine,
      "akten/vertrag",
      "---\ntitle: Mietvertrag\n---\n\nMietvertrag über die Wohnung Top 7, Mietzins monatlich.\n",
      { sourceId: "kanzlei-eu", noEmbed: true }
    );
    installTransport();
    configure();
    let meta: HybridSearchMeta | null = null;
    const results = await runWithRequestEuOnly(() =>
      hybridSearch(engine, "Mietvertrag Wohnung", {
        sourceId: "kanzlei-eu",
        onMeta: (m) => {
          meta = m;
        },
      })
    );
    expect(sent).toEqual([]);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.retrieval_limited === "eu_only_keyword_only")).toBe(true);
    expect(meta!.vector_enabled).toBe(false);
    expect(meta!.vector_skipped_reason).toBe("eu_only");
  });

  it("standalone worker: firm registry applies, corpus goes through", async () => {
    installTransport();
    configure();
    await expect(embedForSource(engine, "kanzlei-eu", ["Mandantendaten"])).rejects.toBeInstanceOf(
      EuResidencyError
    );
    expect(sent).toEqual([]);
    await embedForSource(engine, "law-at", ["§ 1 ABGB"]);
    expect(sent).toEqual([["§ 1 ABGB"]]);
  });
});

describe("standalone embed worker (scripts/embed-worker-standalone.ts)", () => {
  it("default scope is the public corpus only", () => {
    const scope = resolveSourceScope({ source: null, allowFirmSource: false });
    expect(scope).toEqual({ kind: "corpus" });
    const q = candidateQuery(scope);
    expect(q).toContain("p.source_id LIKE 'law-%'");
    expect(q).toContain("corpus_page_verified");
    expect(q).toContain("FOR UPDATE OF c SKIP LOCKED");
    expect(candidateParams(scope, 50)).toEqual([50]);
  });

  it("a firm source needs --allow-firm-source", () => {
    expect(() => resolveSourceScope({ source: "kanzlei-a", allowFirmSource: false })).toThrow(
      /allow-firm-source/
    );
    const scope = resolveSourceScope({ source: "kanzlei-a", allowFirmSource: true });
    expect(scope).toEqual({ kind: "source", sourceId: "kanzlei-a", firm: true });
    expect(candidateQuery(scope)).toContain("p.source_id = $2");
    expect(candidateParams(scope, 10)).toEqual([10, "kanzlei-a"]);
  });

  it("embeds through the gateway: the OpenRouter request carries zdr + data_collection deny", async () => {
    configure();
    const bodies: Record<string, unknown>[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          object: "list",
          data: [{ object: "embedding", index: 0, embedding: new Array(1536).fill(0.1) }],
          model: "openai/text-embedding-3-small",
          usage: { prompt_tokens: 3, total_tokens: 3 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;
    const config = { getConfig: async () => null, setConfig: async () => {} };
    try {
      await embedForSource(config, "law-at", ["§ 1 ABGB"]);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(bodies.length).toBe(1);
    expect(bodies[0]!.provider).toMatchObject({ zdr: true, data_collection: "deny" });
  });

  it("no raw OpenRouter call left in the script", () => {
    const src = readFileSync(
      join(import.meta.dir, "../scripts/embed-worker-standalone.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/fetch\(\s*["']https:\/\/openrouter\.ai/);
  });
});
