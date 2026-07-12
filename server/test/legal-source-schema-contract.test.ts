import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("legal source schema contract", () => {
  test("Postgres and PGLite source schemas expose jurisdiction", () => {
    const postgres = readFileSync(new URL("../src/schema.sql", import.meta.url), "utf8");
    const pglite = readFileSync(new URL("../src/core/pglite-schema.ts", import.meta.url), "utf8");
    expect(postgres).toContain("jurisdiction    TEXT CHECK");
    expect(pglite).toContain("jurisdiction  TEXT CHECK");
  });

  test("Postgres schema restricts legal jurisdiction values", () => {
    const postgres = readFileSync(new URL("../src/schema.sql", import.meta.url), "utf8");
    expect(postgres).toContain("IN ('at','de','ch','eu')");
    expect(postgres).toContain("enforce_statute_source_jurisdiction");
    expect(postgres).toContain("statute_source_jurisdiction_trg");
    expect(postgres).toContain("CREATE TABLE IF NOT EXISTS legal_source_versions");
    expect(postgres).toContain("valid_from      DATE NOT NULL");
    expect(postgres).toContain("valid_to        DATE");
  });

  test("manifest validator exists as a provider-independent gate", () => {
    const script = readFileSync(
      new URL("../scripts/check-legal-corpus-manifest.ts", import.meta.url),
      "utf8"
    );
    expect(script).toContain("version_date missing or invalid");
    expect(script).toContain("duplicate legal version");
  });
});
