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

const readModel = vi.hoisted(() => ({
  fristen: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/fristen-read-model", () => ({
  loadFristenReadModelCached: vi.fn(async () => ({
    fristen: readModel.fristen,
    failedSources: [],
  })),
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
    readModel.fristen = [];
    const notifs = await generateCopilotNotifications(HEADERS, "brain-1", "user-1", false);
    expect(listEnginePages).toHaveBeenCalledWith(HEADERS, "legal_case", 500);
    expect(notifs.every((n) => n.caseSlug === "legal/cases/visible")).toBe(true);
  });

  it("the fallback scan also uses the caller's headers", async () => {
    await getCopilotNotifications(HEADERS, "brain-1", "user-1", false);
    expect(listEnginePages).toHaveBeenCalledWith(HEADERS, "legal_case", 500);
  });

  it("alerts a critical deadline of an older matter outside the recent scan (R11-8)", async () => {
    const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    readModel.fristen = [
      {
        id: "legal/deadlines/alt",
        case_slug: "legal/cases/aelteste",
        case_title: "Älteste Akte",
        title: "Berufung",
        due_date: inTwoDays,
        status: "critical",
      },
      {
        id: "legal/deadlines/done",
        case_slug: "legal/cases/erledigt",
        title: "Erledigt",
        due_date: inTwoDays,
        status: "done",
      },
    ];
    const notifs = await generateCopilotNotifications(HEADERS, "brain-1", "user-1", false);
    const critical = notifs.filter((n) => n.type === "critical_deadline");
    expect(critical.map((n) => n.caseSlug)).toEqual(["legal/cases/aelteste"]);
    readModel.fristen = [];
  });
});
