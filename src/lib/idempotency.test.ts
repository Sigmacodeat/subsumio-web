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
