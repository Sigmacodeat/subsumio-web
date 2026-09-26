import { describe, expect, it } from "vitest";
import {
  claimPendingUpload,
  newUploadToken,
  releasePendingUpload,
} from "../src/core/upload-confirm-claim.ts";

describe("upload confirm claim", () => {
  it("two simultaneous confirms of one token: only the first runs", () => {
    const pending = {};
    const results = [claimPendingUpload(pending), claimPendingUpload(pending)];
    expect(results).toEqual([true, false]);
  });

  it("an unfinished confirm gives the token back for a retry", () => {
    const pending = {};
    expect(claimPendingUpload(pending)).toBe(true);
    releasePendingUpload(pending);
    expect(claimPendingUpload(pending)).toBe(true);
  });
});

describe("upload token", () => {
  it("is 256 bit hex from the CSPRNG and never repeats", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => newUploadToken()));
    expect(tokens.size).toBe(1000);
    for (const t of tokens) expect(t).toMatch(/^[0-9a-f]{64}$/);
  });
});
