import { describe, it, expect, afterEach } from "vitest";
import { isVideoConfigured, videoLinkFor } from "./video-link";

describe("video-link", () => {
  const OLD = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD };
  });

  it("reports not configured without JITSI_DOMAIN", () => {
    delete process.env.JITSI_DOMAIN;
    expect(isVideoConfigured()).toBe(false);
    expect(videoLinkFor("legal/appointments/appt-1")).toBeNull();
  });

  it("builds a deterministic, non-guessable room URL", () => {
    process.env.JITSI_DOMAIN = "meet.example.at";
    const a = videoLinkFor("legal/appointments/appt-1");
    const b = videoLinkFor("legal/appointments/appt-1");
    const c = videoLinkFor("legal/appointments/appt-2");
    expect(a).toMatch(/^https:\/\/meet\.example\.at\/subsumio-[0-9a-f]{20}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain("appt-1");
  });

  it("tolerates a trailing slash in the domain", () => {
    process.env.JITSI_DOMAIN = "meet.example.at/";
    expect(videoLinkFor("s")!.startsWith("https://meet.example.at/")).toBe(true);
  });
});
