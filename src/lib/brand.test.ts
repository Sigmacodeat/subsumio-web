import { describe, test, expect, vi, afterEach } from "vitest";
import { brandForHost, isExternalUrl, OTHER_VERTICAL_PATHS, type SiteBrand } from "./brand";

// subsumioCanonical depends on module-level SUBSUMIO_SITE_URL which is
// evaluated at import time. Use dynamic imports for env-dependent tests.

describe("brandForHost", () => {
  test("returns 'subsumio' for subsum.eu", () => {
    expect(brandForHost("subsum.eu")).toBe("subsumio" as SiteBrand);
  });

  test("returns 'subsumio' for www.subsum.eu", () => {
    expect(brandForHost("www.subsum.eu")).toBe("subsumio" as SiteBrand);
  });

  test("returns 'subsumio' for subsum.io", () => {
    expect(brandForHost("subsum.io")).toBe("subsumio" as SiteBrand);
  });

  test("returns 'subsumio' for null host", () => {
    expect(brandForHost(null)).toBe("subsumio");
  });

  test("returns 'subsumio' for undefined host", () => {
    expect(brandForHost(undefined)).toBe("subsumio");
  });

  test("returns 'subsumio' for empty string", () => {
    expect(brandForHost("")).toBe("subsumio");
  });

  test("strips port from host", () => {
    expect(brandForHost("subsum.eu:3000")).toBe("subsumio");
  });

  test("handles uppercase host", () => {
    expect(brandForHost("SUBSUM.EU")).toBe("subsumio");
  });

  test("handles unknown host (still subsumio in single-brand)", () => {
    expect(brandForHost("example.com")).toBe("subsumio");
  });
});

describe("OTHER_VERTICAL_PATHS", () => {
  test("is empty array in Subsumio-only build", () => {
    expect(OTHER_VERTICAL_PATHS).toEqual([]);
  });
});

describe("isExternalUrl", () => {
  test("returns true for http:// URLs", () => {
    expect(isExternalUrl("http://example.com")).toBe(true);
  });

  test("returns true for https:// URLs", () => {
    expect(isExternalUrl("https://example.com")).toBe(true);
  });

  test("returns false for relative URLs", () => {
    expect(isExternalUrl("/dashboard")).toBe(false);
  });

  test("returns false for protocol-relative URLs", () => {
    expect(isExternalUrl("//example.com")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isExternalUrl("")).toBe(false);
  });
});

describe("subsumioCanonical", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
    vi.resetModules();
  });

  async function freshImport() {
    vi.resetModules();
    return await import("./brand");
  }

  test("returns root for German (default env)", async () => {
    delete process.env.NEXT_PUBLIC_SUBSUMIO_URL;
    const { subsumioCanonical } = await freshImport();
    // Default SUBSUMIO_SITE_URL is https://subsum.eu
    expect(subsumioCanonical("de")).toBe("https://subsum.eu");
  });

  test("returns /en for English (default env)", async () => {
    delete process.env.NEXT_PUBLIC_SUBSUMIO_URL;
    const { subsumioCanonical } = await freshImport();
    expect(subsumioCanonical("en")).toBe("https://subsum.eu/en");
  });

  test("returns relative / when site URL is not external (de)", async () => {
    process.env.NEXT_PUBLIC_SUBSUMIO_URL = "/local";
    const { subsumioCanonical } = await freshImport();
    expect(subsumioCanonical("de")).toBe("/");
  });

  test("returns relative /en when site URL is not external", async () => {
    process.env.NEXT_PUBLIC_SUBSUMIO_URL = "/local";
    const { subsumioCanonical } = await freshImport();
    expect(subsumioCanonical("en")).toBe("/en");
  });

  test("returns full URL when SUBSUMIO_SITE_URL is external", async () => {
    process.env.NEXT_PUBLIC_SUBSUMIO_URL = "https://subsum.eu";
    const { subsumioCanonical } = await freshImport();
    expect(subsumioCanonical("de")).toBe("https://subsum.eu");
    expect(subsumioCanonical("en")).toBe("https://subsum.eu/en");
  });

  test("strips trailing slash from site URL", async () => {
    process.env.NEXT_PUBLIC_SUBSUMIO_URL = "https://subsum.eu/";
    const { subsumioCanonical } = await freshImport();
    expect(subsumioCanonical("de")).toBe("https://subsum.eu");
  });
});
