// @vitest-environment node

/**
 * The DMS connector is resolved per request from the caller's firm: each firm
 * talks to its own DMS with its own key. The installation (env) DMS is only a
 * transition for firms listed in DMS_ALLOWED_BRAIN_IDS; a firm with a broken
 * stored config never falls back to it.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import type { DMSSettings } from "./index";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine", enginePatchPage: vi.fn() }));

const firmSettings: Record<string, DMSSettings | Error> = {
  "brain-a": { provider: "imanager", baseUrl: "https://dms-a.example.com", apiKey: "key-a" },
  "brain-b": { provider: "netdocuments", baseUrl: "https://dms-b.example.com", apiKey: "key-b" },
  "brain-broken": new Error("dms_config_unreadable"),
};

vi.mock("./config-store", () => ({
  getDmsSettingsForBrain: vi.fn(async (brainId: string) => {
    const s = firmSettings[brainId];
    if (s instanceof Error) throw s;
    return s ?? null;
  }),
}));

import { getConnectorForBrain, resolveDmsForBrain } from "./index";

function lastCall(spy: { mock: { calls: unknown[][] } }) {
  const [url, init] = spy.mock.calls.at(-1) as [string, RequestInit];
  return { url: String(url), auth: new Headers(init?.headers).get("authorization") };
}

describe("resolveDmsForBrain — per firm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.DMS_ALLOWED_BRAIN_IDS;
    delete process.env.DMS_PROVIDER;
  });
  afterEach(() => {
    delete process.env.DMS_ALLOWED_BRAIN_IDS;
    delete process.env.DMS_PROVIDER;
  });

  test("two firms get connectors bound to their own endpoint and key", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify({}), { status: 200 }));

    const a = await resolveDmsForBrain("brain-a");
    expect(a?.source).toBe("firm");
    expect(a?.provider).toBe("imanager");
    await a!.connector.search("vertrag");
    expect(lastCall(fetchSpy).url).toMatch(/^https:\/\/dms-a\.example\.com\//);
    expect(lastCall(fetchSpy).auth).toBe("Bearer key-a");

    const b = await resolveDmsForBrain("brain-b");
    expect(b?.provider).toBe("netdocuments");
    await b!.connector.search("vertrag");
    expect(lastCall(fetchSpy).url).toMatch(/^https:\/\/dms-b\.example\.com\//);
    expect(lastCall(fetchSpy).auth).toBe("Bearer key-b");

    await b!.connector.getDocumentContent("doc-of-a");
    expect(lastCall(fetchSpy).url).toMatch(/^https:\/\/dms-b\.example\.com\//);
    expect(lastCall(fetchSpy).auth).toBe("Bearer key-b");
  });

  test("a firm without its own config and not on the transition list gets nothing", async () => {
    process.env.DMS_PROVIDER = "imanager";
    process.env.DMS_ALLOWED_BRAIN_IDS = "brain-legacy";
    expect(await resolveDmsForBrain("brain-c")).toBeNull();
    expect(await getConnectorForBrain("brain-c")).toBeNull();
    expect(await getConnectorForBrain(undefined)).toBeNull();
  });

  test("the installation DMS stays available for firms on the transition list", async () => {
    process.env.DMS_PROVIDER = "imanager";
    process.env.DMS_ALLOWED_BRAIN_IDS = "brain-legacy";
    const r = await resolveDmsForBrain("brain-legacy");
    expect(r?.source).toBe("installation");
    expect(r?.connector.name).toBe("iManage Work");
  });

  test("a firm's own config wins over the transition list", async () => {
    process.env.DMS_PROVIDER = "imanager";
    process.env.DMS_ALLOWED_BRAIN_IDS = "brain-b";
    const r = await resolveDmsForBrain("brain-b");
    expect(r?.source).toBe("firm");
    expect(r?.provider).toBe("netdocuments");
  });

  test("an unreadable firm config fails closed — no fallback to the installation DMS", async () => {
    process.env.DMS_PROVIDER = "imanager";
    process.env.DMS_ALLOWED_BRAIN_IDS = "brain-broken";
    expect(await resolveDmsForBrain("brain-broken")).toBeNull();
  });
});
