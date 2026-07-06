import { describe, expect, test } from "bun:test";
import { MIGRATIONS } from "../src/core/migrate.ts";

describe("canonical ingest identity migration", () => {
  const migration = MIGRATIONS.find((item) => item.version === 120);

  test("creates immutable blobs, logical references and durable sessions", () => {
    expect(migration).toBeDefined();
    expect(migration!.idempotent).toBe(true);
    expect(migration!.sql).toContain("CREATE TABLE IF NOT EXISTS content_blobs");
    expect(migration!.sql).toContain("UNIQUE(source_id, sha256)");
    expect(migration!.sql).toContain("CREATE TABLE IF NOT EXISTS document_refs");
    expect(migration!.sql).toContain("document_refs_active_filing_unique");
    expect(migration!.sql).toContain("CREATE TABLE IF NOT EXISTS ingest_sessions");
  });

  test("backfills legacy files without creating duplicate blobs", () => {
    expect(migration!.sql).toContain("INSERT INTO content_blobs");
    expect(migration!.sql).toContain("ON CONFLICT (source_id, sha256) DO NOTHING");
    expect(migration!.sql).toContain("INSERT INTO document_refs");
  });
});
