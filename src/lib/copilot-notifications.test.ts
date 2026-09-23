// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The browser client reaches the engine without tenant or identity — the
// notifications must never use it server-side.
vi.mock("@/lib/api", () => ({
  api: new Proxy(
    {},
    {
      get() {
        throw new Error("copilot-notifications must not use the browser API client");
      },
    }
  ),
}));

vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: vi.fn(async () => [
    {
      slug: "legal/cases/visible",
      title: "Sichtbare Akte",
      type: "legal_case",
      updated_at: "2020-01-01T00:00:00Z",
      frontmatter: { status: "open" },
    },
  ]),
}));

vi.mock("@/lib/comments", () => ({
  persistNotificationUpsert: vi.fn(async () => undefined),
  listNotifications: vi.fn(async () => []),
}));

import { generateCopilotNotifications, getCopilotNotifications } from "./copilot-notifications";
import { listEnginePages } from "@/lib/engine-pages";

const HEADERS = {
  "x-subsumio-source": "brain-1",
  "x-subsumio-identity-token": "signed-token",
};

describe("copilot notifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scans matters with the caller's identity-bearing headers", async () => {
    const notifs = await generateCopilotNotifications(HEADERS, "brain-1", "user-1", false);
    expect(listEnginePages).toHaveBeenCalledWith(HEADERS, "legal_case", 500);
    expect(notifs.every((n) => n.caseSlug === "legal/cases/visible")).toBe(true);
  });

  it("the fallback scan also uses the caller's headers", async () => {
    await getCopilotNotifications(HEADERS, "brain-1", "user-1", false);
    expect(listEnginePages).toHaveBeenCalledWith(HEADERS, "legal_case", 500);
  });
});
