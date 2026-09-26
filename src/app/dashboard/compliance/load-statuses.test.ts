// UIS-1-9: only a missing page means "nothing saved yet"; any other load
// failure must surface so the next click cannot overwrite stored statuses.
import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/api";
import { loadComplianceStatuses } from "./load-statuses";

const SLUG = "legal/compliance/selbstauskunft";

describe("loadComplianceStatuses", () => {
  it("returns the stored statuses", async () => {
    const stored = { "dsgvo-1": "ok", "gwg-2": "fail" };
    await expect(
      loadComplianceStatuses(async () => ({ frontmatter: { check_statuses: stored } }), SLUG)
    ).resolves.toEqual(stored);
  });

  it("treats a missing page (404) as an empty assessment", async () => {
    await expect(
      loadComplianceStatuses(async () => {
        throw new ApiRequestError("not found", 404);
      }, SLUG)
    ).resolves.toEqual({});
  });

  it("rethrows any other failure", async () => {
    await expect(
      loadComplianceStatuses(async () => {
        throw new ApiRequestError("engine down", 502);
      }, SLUG)
    ).rejects.toThrow("engine down");
    await expect(
      loadComplianceStatuses(async () => {
        throw new TypeError("Failed to fetch");
      }, SLUG)
    ).rejects.toThrow("Failed to fetch");
  });
});
