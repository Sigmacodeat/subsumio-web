// UIS-4-8: finishing onboarding must not redirect when the server refused.
import { beforeEach, describe, expect, it, vi } from "vitest";

const csrfFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...a) }));

import { completeOnboarding } from "./complete-onboarding";

beforeEach(() => {
  csrfFetch.mockReset();
});

describe("completeOnboarding", () => {
  it("rejects on an error status", async () => {
    csrfFetch.mockResolvedValue(new Response("x", { status: 500 }));
    await expect(completeOnboarding({ industry: "legal" })).rejects.toThrow("HTTP 500");
  });

  it("resolves when the server confirms", async () => {
    csrfFetch.mockResolvedValue(Response.json({ ok: true }));
    await expect(completeOnboarding({ industry: "legal" })).resolves.toBeUndefined();
    expect(csrfFetch).toHaveBeenCalledWith(
      "/api/onboarding",
      expect.objectContaining({ method: "POST" })
    );
  });
});
