import { describe, it, expect, afterEach } from "bun:test";
import { tryAcquireUpload, releaseUpload, getUploadStats } from "./upload-guard.ts";

const SMALL = 10 * 1024 * 1024; // 10 MB
const LARGE = 100 * 1024 * 1024; // 100 MB

// The guard holds module-level state; release everything after each test so
// cases don't contaminate each other. We track tokens acquired during each
// test and release them all in afterEach.
let acquiredTokens: string[] = [];

afterEach(() => {
  for (const token of acquiredTokens) {
    releaseUpload(token);
  }
  acquiredTokens = [];
});

function acquire(size: number): string | null {
  const token = tryAcquireUpload(size);
  if (token) acquiredTokens.push(token);
  return token;
}

describe("upload-guard concurrency", () => {
  it("allows up to the small-file parallelism, then rejects", () => {
    const { maxSmall } = getUploadStats();
    for (let i = 0; i < maxSmall; i++) {
      expect(acquire(SMALL)).not.toBeNull();
    }
    // One over the limit is rejected.
    expect(acquire(SMALL)).toBeNull();
    expect(getUploadStats().activeSmall).toBe(maxSmall);
  });

  it("allows only one large upload at a time", () => {
    expect(acquire(LARGE)).not.toBeNull();
    expect(acquire(LARGE)).toBeNull();
    expect(getUploadStats().activeLarge).toBe(1);
  });

  it("tracks small and large slots independently", () => {
    expect(acquire(LARGE)).not.toBeNull();
    // A large upload in flight must not block small uploads.
    expect(acquire(SMALL)).not.toBeNull();
    const stats = getUploadStats();
    expect(stats.activeLarge).toBe(1);
    expect(stats.activeSmall).toBe(1);
  });

  it("frees a slot on release so the next upload can proceed", () => {
    const { maxSmall } = getUploadStats();
    for (let i = 0; i < maxSmall; i++) expect(acquire(SMALL)).not.toBeNull();
    expect(acquire(SMALL)).toBeNull();
    // Release one token and try again
    releaseUpload(acquiredTokens[0]);
    acquiredTokens.shift();
    // A slot freed → the next acquire succeeds again.
    expect(acquire(SMALL)).not.toBeNull();
  });

  it("does not release the wrong slot when two files have the same size", () => {
    const t1 = acquire(SMALL);
    const t2 = acquire(SMALL);
    expect(t1).not.toBeNull();
    expect(t2).not.toBeNull();
    expect(t1).not.toBe(t2);
    // Release t1 only — t2 should still be active
    releaseUpload(t1!);
    acquiredTokens = acquiredTokens.filter((t) => t !== t1);
    expect(getUploadStats().activeSmall).toBe(1);
    // t2 can still be released
    releaseUpload(t2!);
    acquiredTokens = acquiredTokens.filter((t) => t !== t2);
    expect(getUploadStats().activeSmall).toBe(0);
  });
});
