// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ApiRequestError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { getPage: vi.fn(), ApiRequestError };
});

vi.mock("./api", () => ({
  api: { brain: { getPage: (...a: unknown[]) => mocks.getPage(...a) } },
  ApiRequestError: mocks.ApiRequestError,
}));

import {
  DEFAULT_KANZLEI_SETTINGS,
  loadKanzleiSettings,
  loadKanzleiSettingsStrict,
} from "./kanzlei-settings";

describe("loadKanzleiSettingsStrict", () => {
  test("returns the stored Rechtsraum", async () => {
    mocks.getPage.mockResolvedValue({
      frontmatter: { rechtsraumCountry: "DE", rechtsraumState: "BY" },
    });
    const s = await loadKanzleiSettingsStrict();
    expect(s.rechtsraumCountry).toBe("DE");
    expect(s.rechtsraumState).toBe("BY");
  });

  test("throws on a failed read instead of silently falling back", async () => {
    mocks.getPage.mockImplementation(async () => {
      throw new mocks.ApiRequestError("down", 503);
    });
    await expect(loadKanzleiSettingsStrict()).rejects.toThrow("down");
    // The lenient loader (used for non-deadline settings) still falls back.
    await expect(loadKanzleiSettings()).resolves.toEqual(DEFAULT_KANZLEI_SETTINGS);
  });

  test("a never-saved settings page (404) counts as not configured", async () => {
    mocks.getPage.mockImplementation(async () => {
      throw new mocks.ApiRequestError("missing", 404);
    });
    await expect(loadKanzleiSettingsStrict()).resolves.toEqual(DEFAULT_KANZLEI_SETTINGS);
  });
});
