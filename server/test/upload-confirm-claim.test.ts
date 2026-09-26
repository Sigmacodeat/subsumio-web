import { describe, expect, it } from "vitest";
import { claimPendingUpload, releasePendingUpload } from "../src/core/upload-confirm-claim.ts";

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
