import { describe, test, expect, vi, afterEach } from "vitest";
import {
  brandForHost,
  isExternalUrl,
  OTHER_VERTICAL_PATHS,
  TAXUMIO_HOSTS,
  SUBSUMIO_HOSTS,
  industryForBrand,
  marketingPathForBrand,
  type SiteBrand,
} from "./brand";

// subsumioCanonical / taxumioCanonical depend on module-level env vars which
// are evaluated at import time. Use dynamic imports for env-dependent tests.

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

  test("returns 'taxumio' for taxum.io", () => {
    expect(brandForHost("taxum.io")).toBe("taxumio" as SiteBrand);
  });

  test("returns 'taxumio' for www.taxum.io", () => {
    expect(brandForHost("www.taxum.io")).toBe("taxumio" as SiteBrand);
  });

  test("returns 'taxumio' for taxumio.com", () => {
    expect(brandForHost("taxumio.com")).toBe("taxumio" as SiteBrand);
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
    expect(brandForHost("taxum.io:443")).toBe("taxumio");
  });

  test("handles uppercase host", () => {
    expect(brandForHost("SUBSUM.EU")).toBe("subsumio");
    expect(brandForHost("TAXUM.IO")).toBe("taxumio");
  });

  test("handles unknown host (defaults to subsumio)", () => {
    expect(brandForHost("example.com")).toBe("subsumio");
  });
});

describe("TAXUMIO_HOSTS", () => {
  test("includes taxum.io and taxumio.com", () => {
    expect(TAXUMIO_HOSTS).toContain("taxum.io");
    expect(TAXUMIO_HOSTS).toContain("taxumio.com");
  });
});

describe("SUBSUMIO_HOSTS", () => {
  test("includes subsum.eu and subsum.io", () => {
    expect(SUBSUMIO_HOSTS).toContain("subsum.eu");
    expect(SUBSUMIO_HOSTS).toContain("subsum.io");
  });
});

describe("industryForBrand", () => {
  test("returns 'legal' for subsumio", () => {
    expect(industryForBrand("subsumio")).toBe("legal");
  });

  test("returns 'tax' for taxumio", () => {
    expect(industryForBrand("taxumio")).toBe("tax");
  });
});

describe("marketingPathForBrand", () => {
  test("returns '/' for subsumio", () => {
    expect(marketingPathForBrand("subsumio")).toBe("/");
  });

  test("returns '/taxumio' for taxumio", () => {
    expect(marketingPathForBrand("taxumio")).toBe("/taxumio");
  });
});

describe("OTHER_VERTICAL_PATHS", () => {
  test("is empty array", () => {
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

describe("taxumioCanonical", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
    vi.resetModules();
  });

  async function freshImport() {
    vi.resetModules();
    return await import("./brand");
  }

  test("returns /taxumio for German (default = relative)", async () => {
    delete process.env.NEXT_PUBLIC_TAXUMIO_URL;
    const { taxumioCanonical } = await freshImport();
    expect(taxumioCanonical("de")).toBe("/taxumio");
  });

  test("returns /en/taxumio for English (default = relative)", async () => {
    delete process.env.NEXT_PUBLIC_TAXUMIO_URL;
    const { taxumioCanonical } = await freshImport();
    expect(taxumioCanonical("en")).toBe("/en/taxumio");
  });

  test("returns full URL when TAXUMIO_SITE_URL is external", async () => {
    process.env.NEXT_PUBLIC_TAXUMIO_URL = "https://taxum.io";
    const { taxumioCanonical } = await freshImport();
    expect(taxumioCanonical("de")).toBe("https://taxum.io");
    expect(taxumioCanonical("en")).toBe("https://taxum.io/en");
  });

  test("strips trailing slash from external URL", async () => {
    process.env.NEXT_PUBLIC_TAXUMIO_URL = "https://taxum.io/";
    const { taxumioCanonical } = await freshImport();
    expect(taxumioCanonical("de")).toBe("https://taxum.io");
  });
});
