// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock getSharedPgPool to control dev/prod behavior
vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: vi.fn(() => null),
}));

// Mock siteUrl to have deterministic URLs
vi.mock("@/lib/mail", () => ({
  siteUrl: () => "http://localhost:3000",
}));

import {
  generateTrackingId,
  generateLinkId,
  injectTracking,
  detectForward,
  getTrackingPixel,
  extractClientIp,
  verifyUrlSignature,
  type TrackingEvent,
} from "./tracking";

describe("generateTrackingId", () => {
  test("produces trk_ prefixed 32-char hex", () => {
    const id = generateTrackingId();
    expect(id).toMatch(/^trk_[a-f0-9]{32}$/);
  });

  test("produces unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateTrackingId()));
    expect(ids.size).toBe(100);
  });
});

describe("generateLinkId", () => {
  test("produces lnk_ prefixed 16-char hex", () => {
    const id = generateLinkId();
    expect(id).toMatch(/^lnk_[a-f0-9]{16}$/);
  });
});

describe("injectTracking", () => {
  test("injects tracking pixel before </body>", () => {
    const html = "<html><body><p>Hello</p></body></html>";
    const result = injectTracking(html, "trk_test123");
    expect(result).toContain('<img src="http://localhost:3000/api/email/track/o/trk_test123.png"');
    expect(result).toContain("</body>");
    // Pixel should be before </body>
    const pixelIdx = result.indexOf('src="http://localhost:3000/api/email/track/o/trk_test123.png');
    const bodyIdx = result.indexOf("</body>");
    expect(pixelIdx).toBeLessThan(bodyIdx);
  });

  test("appends pixel at end when no </body> tag", () => {
    const html = "<p>Hello</p>";
    const result = injectTracking(html, "trk_test456");
    expect(result).toContain('<img src="http://localhost:3000/api/email/track/o/trk_test456.png"');
    expect(result.endsWith('" />')).toBe(true);
  });

  test("rewrites href links to click-redirect", () => {
    const html = '<p><a href="https://example.com/page">Click here</a></p>';
    const result = injectTracking(html, "trk_test789");
    expect(result).toContain("http://localhost:3000/api/email/track/c/trk_test789?l=lnk_");
    expect(result).toContain("&u=");
    expect(result).toContain("&s=");
    expect(result).not.toContain('href="https://example.com/page"');
  });

  test("does not rewrite mailto: links", () => {
    const html = '<p><a href="mailto:test@example.com">Email</a></p>';
    const result = injectTracking(html, "trk_test");
    expect(result).toContain('href="mailto:test@example.com"');
  });

  test("does not rewrite tel: links", () => {
    const html = '<p><a href="tel:+1234567890">Call</a></p>';
    const result = injectTracking(html, "trk_test");
    expect(result).toContain('href="tel:+1234567890"');
  });

  test("does not rewrite anchor links", () => {
    const html = '<p><a href="#section">Jump</a></p>';
    const result = injectTracking(html, "trk_test");
    expect(result).toContain('href="#section"');
  });

  test("does not rewrite already-tracked links", () => {
    const html =
      '<p><a href="http://localhost:3000/api/email/track/c/trk_existing?l=lnk_abc&u=xyz">Link</a></p>';
    const result = injectTracking(html, "trk_test");
    expect(result).toContain(
      'href="http://localhost:3000/api/email/track/c/trk_existing?l=lnk_abc&u=xyz"'
    );
  });

  test("handles multiple links", () => {
    const html = '<p><a href="https://a.com">A</a> <a href="https://b.com">B</a></p>';
    const result = injectTracking(html, "trk_multi");
    const matches = result.match(/api\/email\/track\/c\/trk_multi/g);
    expect(matches).toHaveLength(2);
    // Each link should have a different link ID
    const linkIds = result.match(/l=lnk_[a-f0-9]{16}/g);
    expect(linkIds).toHaveLength(2);
    expect(linkIds![0]).not.toBe(linkIds![1]);
  });

  test("handles single and double quoted hrefs", () => {
    const html = `<p><a href="https://a.com">A</a> <a href='https://b.com'>B</a></p>`;
    const result = injectTracking(html, "trk_quotes");
    expect(result).toContain("api/email/track/c/trk_quotes");
    const matches = result.match(/api\/email\/track\/c\/trk_quotes/g);
    expect(matches).toHaveLength(2);
  });
});

describe("getTrackingPixel", () => {
  test("returns a Buffer", () => {
    const pixel = getTrackingPixel();
    expect(Buffer.isBuffer(pixel)).toBe(true);
  });

  test("returns valid PNG header", () => {
    const pixel = getTrackingPixel();
    // PNG magic bytes: 89 50 4E 47
    expect(pixel[0]).toBe(0x89);
    expect(pixel[1]).toBe(0x50);
    expect(pixel[2]).toBe(0x4e);
    expect(pixel[3]).toBe(0x47);
  });

  test("returns consistent size", () => {
    const p1 = getTrackingPixel();
    const p2 = getTrackingPixel();
    expect(p1.length).toBe(p2.length);
    expect(p1.length).toBeGreaterThan(50);
  });
});

describe("extractClientIp", () => {
  test("extracts from X-Forwarded-For", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(extractClientIp(headers)).toBe("1.2.3.4");
  });

  test("extracts from X-Real-IP", () => {
    const headers = new Headers({ "x-real-ip": "9.8.7.6" });
    expect(extractClientIp(headers)).toBe("9.8.7.6");
  });

  test("returns null when no headers", () => {
    const headers = new Headers();
    expect(extractClientIp(headers)).toBeNull();
  });

  test("prioritizes X-Forwarded-For over X-Real-IP", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.1.1.1",
      "x-real-ip": "2.2.2.2",
    });
    expect(extractClientIp(headers)).toBe("1.1.1.1");
  });
});

describe("detectForward", () => {
  test("returns false when no first open event", () => {
    expect(detectForward(null, "1.2.3.4", { country: "DE", city: "Berlin" }, "Mozilla/5.0")).toBe(
      false
    );
  });

  test("returns false when same IP", () => {
    const firstOpen: TrackingEvent = {
      id: "1",
      messageId: "msg1",
      trackingId: "trk_1",
      eventType: "opened",
      linkId: null,
      targetUrl: null,
      ipAddress: "1.2.3.4",
      userAgent: "Mozilla/5.0",
      geoCountry: "DE",
      geoCity: "Berlin",
      isForward: false,
      raw: {},
      createdAt: new Date().toISOString(),
    };
    expect(
      detectForward(firstOpen, "1.2.3.4", { country: "DE", city: "Berlin" }, "Mozilla/5.0")
    ).toBe(false);
  });

  test("returns true when different IP and different country", () => {
    const firstOpen: TrackingEvent = {
      id: "1",
      messageId: "msg1",
      trackingId: "trk_1",
      eventType: "opened",
      linkId: null,
      targetUrl: null,
      ipAddress: "1.2.3.4",
      userAgent: "Mozilla/5.0",
      geoCountry: "DE",
      geoCity: "Berlin",
      isForward: false,
      raw: {},
      createdAt: new Date().toISOString(),
    };
    expect(
      detectForward(firstOpen, "5.6.7.8", { country: "FR", city: "Paris" }, "Outlook/2.0")
    ).toBe(true);
  });

  test("returns true when different IP and different city", () => {
    const firstOpen: TrackingEvent = {
      id: "1",
      messageId: "msg1",
      trackingId: "trk_1",
      eventType: "opened",
      linkId: null,
      targetUrl: null,
      ipAddress: "1.2.3.4",
      userAgent: "Mozilla/5.0",
      geoCountry: "DE",
      geoCity: "Berlin",
      isForward: false,
      raw: {},
      createdAt: new Date().toISOString(),
    };
    expect(
      detectForward(firstOpen, "5.6.7.8", { country: "DE", city: "Munich" }, "Mozilla/5.0")
    ).toBe(true);
  });
});

describe("verifyUrlSignature", () => {
  test("valid signature is accepted", () => {
    const html = '<p><a href="https://example.com/page">Click here</a></p>';
    const result = injectTracking(html, "trk_sig_test");
    const match = result.match(/&u=([^&]+)&s=([^"&]+)/);
    expect(match).not.toBeNull();
    const [, encoded, sig] = match!;
    expect(verifyUrlSignature(encoded, sig)).toBe(true);
  });

  test("tampered URL is rejected", () => {
    const html = '<p><a href="https://example.com/page">Click here</a></p>';
    const result = injectTracking(html, "trk_tamper_test");
    const match = result.match(/&u=([^&]+)&s=([^"&]+)/);
    expect(match).not.toBeNull();
    const [, , sig] = match!;
    const tamperedEncoded = Buffer.from("https://evil.com").toString("base64url");
    expect(verifyUrlSignature(tamperedEncoded, sig)).toBe(false);
  });

  test("tampered signature is rejected", () => {
    const html = '<p><a href="https://example.com/page">Click here</a></p>';
    const result = injectTracking(html, "trk_sig_tamper");
    const match = result.match(/&u=([^&]+)&s=([^"&]+)/);
    expect(match).not.toBeNull();
    const [, encoded] = match!;
    expect(verifyUrlSignature(encoded, "invalid_signature")).toBe(false);
  });
});

describe("logTrackingEvent (dev mode — no DB)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  test("returns null and logs when no pool", async () => {
    const { logTrackingEvent } = await import("./tracking");
    const result = await logTrackingEvent({
      trackingId: "trk_test",
      eventType: "opened",
      ipAddress: "1.2.3.4",
    });
    expect(result).toBeNull();
    expect(process.stdout.write).toHaveBeenCalled();
  });
});
