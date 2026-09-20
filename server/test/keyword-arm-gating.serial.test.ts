/**
 * Keyword-arm gating (search.keyword_arm).
 *
 * 'always' fuses the keyword arm into every query (historical behavior).
 * 'citations' fuses it only when the query cites a source; a plain-language
 * question ranks on the vector arm alone. The corpus below has the one
 * trap the Austrian-law bake-off kept hitting: a page that shares the
 * question's words but answers something else.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import {
  configureGateway,
  resetGateway,
  __setEmbedTransportForTests,
} from "../src/core/ai/gateway.ts";
import { hybridSearch } from "../src/core/search/hybrid.ts";
import { isCitationQuery } from "../src/core/search/citation-query.ts";
import { KNOBS_HASH_VERSION, knobsHash, resolveSearchMode } from "../src/core/search/mode.ts";

const DIMS = 1536;
const RIGHT = "notes/gewaehrleistungsfrist";
const TRAP = "notes/pickerl-mangel";
const QUESTION = "Wie lange habe ich Gewährleistung für mein Auto mit Mangel";

/** Unit vector along one axis. */
function axis(i: number): Float32Array {
  const v = new Float32Array(DIMS);
  v[i] = 1;
  return v;
}

let engine: PGLiteEngine;
// Isolate from the developer's own ~/.gbrain config (its embedding model
// would otherwise leak into the search path).
const savedHome = process.env.GBRAIN_HOME;
const isolatedHome = mkdtempSync(join(tmpdir(), "keyword-arm-home-"));

beforeAll(async () => {
  process.env.GBRAIN_HOME = isolatedHome;
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  // Search resolves its vector column from the brain config; pin it to the
  // model the gateway embeds with.
  await engine.setConfig("embedding_model", "openrouter:openai/text-embedding-3-small");
  await engine.setConfig("embedding_dimensions", String(DIMS));
  // The right answer says it in legal wording — no word of the question.
  await engine.putPage(RIGHT, {
    type: "concept",
    title: "§ 933 ABGB",
    compiled_truth:
      "Das Recht auf die Gewährleistung muss bei beweglichen Sachen binnen zwei Jahren gerichtlich geltend gemacht werden.",
  });
  await engine.upsertChunks(RIGHT, [
    {
      chunk_index: 0,
      chunk_text:
        "Das Recht muss bei beweglichen Sachen binnen zwei Jahren gerichtlich geltend gemacht werden.",
      chunk_source: "compiled_truth",
      embedding: axis(0),
    },
  ]);
  // The trap shares the question's words but is about vehicle inspection.
  await engine.putPage(TRAP, {
    type: "concept",
    title: "§ 57a KFG",
    compiled_truth:
      "Wie lange darf ich mit meinem Auto mit Mangel fahren, Gewährleistung der Verkehrssicherheit.",
  });
  await engine.upsertChunks(TRAP, [
    {
      chunk_index: 0,
      chunk_text:
        "Wie lange darf ich mit meinem Auto mit Mangel fahren, Gewährleistung der Verkehrssicherheit.",
      chunk_source: "compiled_truth",
      embedding: axis(1),
    },
  ]);
  configureGateway({
    embedding_model: "openrouter:openai/text-embedding-3-small",
    embedding_dimensions: DIMS,
    env: { OPENROUTER_API_KEY: "sk-fake" },
  });
  // The question embeds right next to the right answer.
  __setEmbedTransportForTests((async (args: any) => ({
    embeddings: args.values.map(() => Array.from(axis(0))),
  })) as any);
}, 60_000);

afterAll(async () => {
  __setEmbedTransportForTests(null);
  resetGateway();
  await engine.disconnect();
  if (savedHome === undefined) delete process.env.GBRAIN_HOME;
  else process.env.GBRAIN_HOME = savedHome;
  rmSync(isolatedHome, { recursive: true, force: true });
});

async function topSlugs(keywordArm: "always" | "citations", query = QUESTION) {
  const results = await hybridSearch(engine, query, {
    limit: 5,
    keywordArm,
    expansion: false,
  });
  return results.map((r) => r.slug);
}

describe("keyword_arm knob", () => {
  test("defaults to 'always' in every mode", () => {
    for (const mode of ["conservative", "balanced", "tokenmax"] as const) {
      expect(resolveSearchMode({ mode }).keyword_arm).toBe("always");
    }
  });

  test("config and per-call override, per-call wins", () => {
    expect(
      resolveSearchMode({ mode: "balanced", overrides: { keyword_arm: "citations" } }).keyword_arm
    ).toBe("citations");
    expect(
      resolveSearchMode({
        mode: "balanced",
        overrides: { keyword_arm: "citations" },
        perCall: { keyword_arm: "always" },
      }).keyword_arm
    ).toBe("always");
  });

  test("the cache never mixes the two rankings", () => {
    expect(KNOBS_HASH_VERSION).toBe(16);
    const always = knobsHash(resolveSearchMode({ mode: "balanced" }));
    const gated = knobsHash(
      resolveSearchMode({ mode: "balanced", perCall: { keyword_arm: "citations" } })
    );
    expect(gated).not.toBe(always);
  });
});

describe("citation detection", () => {
  test("citations", () => {
    expect(isCitationQuery("§ 933 ABGB Frist")).toBe(true);
    expect(isCitationQuery("Wer ist Unternehmer nach dem UGB?")).toBe(true);
    expect(isCitationQuery("OGH 1 Ob 23/19x")).toBe(true);
  });
  test("plain questions", () => {
    expect(isCitationQuery(QUESTION)).toBe(false);
  });
});

describe("hybridSearch with keyword_arm", () => {
  test("'always': the word-sharing trap outranks the right answer", async () => {
    const slugs = await topSlugs("always");
    expect(slugs.indexOf(TRAP)).toBeLessThan(slugs.indexOf(RIGHT));
  });

  test("'citations': a plain question ranks the right answer first", async () => {
    const slugs = await topSlugs("citations");
    expect(slugs[0]).toBe(RIGHT);
  });

  test("'citations': a query with a citation still uses the keyword arm", async () => {
    const slugs = await topSlugs("citations", "Gewährleistung Auto Mangel § 57a KFG");
    expect(slugs).toContain(TRAP);
  });
});
