// P0-SEC-003: idempotency store contract (in-memory fallback path).
// Without a Postgres pool the store falls back to an in-memory map with TTL.
// This locks the dedup semantics that all webhook handlers rely on.

import { describe, expect, it } from "vitest";
import { createIdempotencyStore } from "@/lib/idempotency";

describe("createIdempotencyStore (in-memory fallback)", () => {
  it("reports an unseen id as not processed", async () => {
    const store = createIdempotencyStore("test_idem_unseen");
    expect(await store.isProcessed("evt_1")).toBe(false);
  });

  it("marks an id as processed and dedups on the second check", async () => {
    const store = createIdempotencyStore("test_idem_mark");
    expect(await store.isProcessed("evt_1")).toBe(false);
    await store.markProcessed("evt_1", "case.created");
    expect(await store.isProcessed("evt_1")).toBe(true);
  });

  it("isolates ids — a different id stays unprocessed", async () => {
    const store = createIdempotencyStore("test_idem_isolate");
    await store.markProcessed("evt_a");
    expect(await store.isProcessed("evt_a")).toBe(true);
    expect(await store.isProcessed("evt_b")).toBe(false);
  });

  it("expires entries after the TTL", async () => {
    const store = createIdempotencyStore("test_idem_ttl", [], { ttlMs: 5 });
    await store.markProcessed("evt_ttl");
    expect(await store.isProcessed("evt_ttl")).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(await store.isProcessed("evt_ttl")).toBe(false);
  });
});

// ── Additional edge cases ───────────────────────────────────────────────

describe("createIdempotencyStore — additional edge cases", () => {
  it("re-marking an already-processed id stays processed", async () => {
    const store = createIdempotencyStore("test_idem_remark");
    await store.markProcessed("evt_remark");
    expect(await store.isProcessed("evt_remark")).toBe(true);
    await store.markProcessed("evt_remark");
    expect(await store.isProcessed("evt_remark")).toBe(true);
  });

  it("isolates between different store instances (different table names)", async () => {
    const storeA = createIdempotencyStore("test_idem_store_a");
    const storeB = createIdempotencyStore("test_idem_store_b");
    await storeA.markProcessed("shared_id");
    expect(await storeA.isProcessed("shared_id")).toBe(true);
    expect(await storeB.isProcessed("shared_id")).toBe(false);
  });

  it("handles multiple ids in the same store", async () => {
    const store = createIdempotencyStore("test_idem_multi");
    for (let i = 0; i < 10; i++) {
      await store.markProcessed(`evt_${i}`);
    }
    for (let i = 0; i < 10; i++) {
      expect(await store.isProcessed(`evt_${i}`)).toBe(true);
    }
    expect(await store.isProcessed("evt_999")).toBe(false);
  });

  it("accepts extra columns without error in markProcessed", async () => {
    const store = createIdempotencyStore("test_idem_extra_cols", [
      "event_type text",
      "envelope_id text",
    ]);
    await store.markProcessed("evt_extra", "payment.succeeded", "env_123");
    expect(await store.isProcessed("evt_extra")).toBe(true);
  });

  it("accepts null values for extra columns", async () => {
    const store = createIdempotencyStore("test_idem_null_extra", ["event_type text"]);
    await store.markProcessed("evt_null", null);
    expect(await store.isProcessed("evt_null")).toBe(true);
  });

  it("supports custom primary key column name", async () => {
    const store = createIdempotencyStore(
      "test_idem_custom_pk",
      [],
      { primaryKeyColumn: "webhook_id" },
    );
    await store.markProcessed("wh_123");
    expect(await store.isProcessed("wh_123")).toBe(true);
    expect(await store.isProcessed("wh_456")).toBe(false);
  });

  it("evicts expired entries when maxInMemory is exceeded", async () => {
    const store = createIdempotencyStore(
      "test_idem_evict",
      [],
      { maxInMemory: 3, ttlMs: 5 },
    );
    // Fill beyond maxInMemory with short TTL
    for (let i = 0; i < 5; i++) {
      await store.markProcessed(`evt_evict_${i}`);
    }
    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 10));
    // All entries should be expired now
    expect(await store.isProcessed("evt_evict_0")).toBe(false);
    expect(await store.isProcessed("evt_evict_4")).toBe(false);
  });

  it("handles empty string id", async () => {
    const store = createIdempotencyStore("test_idem_empty");
    await store.markProcessed("");
    expect(await store.isProcessed("")).toBe(true);
  });

  it("handles very long id strings", async () => {
    const store = createIdempotencyStore("test_idem_long");
    const longId = "evt_" + "x".repeat(500);
    await store.markProcessed(longId);
    expect(await store.isProcessed(longId)).toBe(true);
  });

  it("handles unicode and special characters in id", async () => {
    const store = createIdempotencyStore("test_idem_unicode");
    const id = "evt_äöü_日本語_🎉";
    await store.markProcessed(id);
    expect(await store.isProcessed(id)).toBe(true);
  });

  it("does not report false positive for similar ids", async () => {
    const store = createIdempotencyStore("test_idem_similar");
    await store.markProcessed("evt_123");
    expect(await store.isProcessed("evt_1234")).toBe(false);
    expect(await store.isProcessed("evt_123")).toBe(true);
  });
});
