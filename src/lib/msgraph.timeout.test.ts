// @vitest-environment node
//
// R11-12: Graph calls are bounded — a hanging request must not hold the
// Outlook sync run forever.
import { beforeEach, describe, expect, test, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.MS365_CLIENT_ID = "id";
  process.env.MS365_CLIENT_SECRET = "secret";
  process.env.MS365_TENANT_ID = "tenant";
  process.env.MS365_MAILBOX = "kanzlei@firma.example";
});

describe("msgraph", () => {
  test("token and data requests carry an abort signal", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("login.microsoftonline.com")
        ? Response.json({ access_token: "tok", expires_in: 3600 })
        : Response.json({ value: [] })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { syncCalendar } = await import("./msgraph");
    await syncCalendar().catch(() => undefined);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const call of fetchMock.mock.calls) {
      const init = (call as unknown as [string, RequestInit])[1];
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  test("a hanging Graph call is aborted by its signal", async () => {
    const fetchMock = vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          if (url.includes("login.microsoftonline.com")) {
            resolve(Response.json({ access_token: "tok", expires_in: 3600 }));
            return;
          }
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const timeouts: number[] = [];
    vi.doMock("@/lib/retry", () => ({
      externalFetchTimeout: (ms?: number) => {
        timeouts.push(ms ?? 10_000);
        return AbortSignal.timeout(20);
      },
    }));
    const { syncCalendar } = await import("./msgraph");
    await expect(syncCalendar()).rejects.toThrow();
    expect(timeouts.length).toBeGreaterThanOrEqual(2);
  });
});
