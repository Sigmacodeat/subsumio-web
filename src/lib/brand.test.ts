import { afterEach, describe, expect, test, vi } from "vitest";
import { LEGACY_TAXUMIO_HOSTS, SUBSUMIO_HOSTS, isExternalUrl, subsumioCanonical } from "./brand";

describe("Subsumio brand configuration", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUBSUMIO_URL;
    vi.resetModules();
  });

  test("contains the canonical Subsumio hosts", () => {
    expect(SUBSUMIO_HOSTS).toContain("subsum.eu");
    expect(SUBSUMIO_HOSTS).toContain("subsum.io");
  });

  test("retains former Taxumio hosts only for redirects", () => {
    expect(LEGACY_TAXUMIO_HOSTS).toContain("taxum.io");
    expect(LEGACY_TAXUMIO_HOSTS).toContain("taxumio.com");
  });

  test("detects external URLs", () => {
    expect(isExternalUrl("https://subsum.eu")).toBe(true);
    expect(isExternalUrl("/")).toBe(false);
  });

  test("builds the default Subsumio canonical URLs", () => {
    expect(subsumioCanonical("de")).toBe("https://subsum.eu");
    expect(subsumioCanonical("en")).toBe("https://subsum.eu/en");
  });

  test("supports a relative local Subsumio URL", async () => {
    process.env.NEXT_PUBLIC_SUBSUMIO_URL = "/";
    const { subsumioCanonical: freshCanonical } = await import("./brand");
    expect(freshCanonical("de")).toBe("/");
    expect(freshCanonical("en")).toBe("/en");
  });
});
