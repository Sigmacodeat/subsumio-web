import { describe, it, expect, afterEach } from "vitest";
import { acquireUploadSlot, uploadSlotStats } from "./upload-concurrency";

const SMALL = 10 * 1024 * 1024; // 10 MB
const LARGE = 100 * 1024 * 1024; // 100 MB

// Module-level state — drain any leftover slots between tests.
const held: Array<() => void> = [];
afterEach(() => {
  for (const r of held) r();
  held.length = 0;
});

function acquire(size: number) {
  const r = acquireUploadSlot(size);
  if (r.ok) held.push(r.release);
  return r;
}

describe("upload-concurrency guard", () => {
  it("allows up to the small-file limit, then rejects with occupancy", () => {
    const { maxSmall } = uploadSlotStats();
    for (let i = 0; i < maxSmall; i++) expect(acquire(SMALL).ok).toBe(true);
    const rejected = acquire(SMALL);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.max).toBe(maxSmall);
      expect(rejected.active).toBe(maxSmall);
      expect(rejected.large).toBe(false);
    }
  });

  it("allows only one large upload at a time", () => {
    expect(acquire(LARGE).ok).toBe(true);
    const rejected = acquire(LARGE);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.large).toBe(true);
  });

  it("tracks small and large independently", () => {
    expect(acquire(LARGE).ok).toBe(true);
    expect(acquire(SMALL).ok).toBe(true);
    const s = uploadSlotStats();
    expect(s.activeLarge).toBe(1);
    expect(s.activeSmall).toBe(1);
  });

  it("release frees the slot and is idempotent (double-release is safe)", () => {
    const { maxSmall } = uploadSlotStats();
    const first = acquireUploadSlot(SMALL);
    expect(first.ok).toBe(true);
    for (let i = 1; i < maxSmall; i++) acquire(SMALL);
    expect(acquire(SMALL).ok).toBe(false); // full
    if (first.ok) {
      first.release();
      first.release(); // second call must be a no-op, not free a foreign slot
    }
    expect(uploadSlotStats().activeSmall).toBe(maxSmall - 1);
    expect(acquire(SMALL).ok).toBe(true); // the freed slot is reusable
  });
});
