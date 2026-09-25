// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPublicDmsUrl, dmsSafeFetch, isBlockedAddress, setDmsHostResolver } from "./egress";

afterEach(() => {
  setDmsHostResolver(async () => ["93.184.216.34"]);
  vi.unstubAllGlobals();
});

describe("DMS egress guard", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.5",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:10.0.0.1",
  ])("blocks internal address %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it("allows a public address", () => {
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
  });

  it("rejects http and a host that resolves to an internal address", async () => {
    await expect(assertPublicDmsUrl("http://dms.example.com")).rejects.toThrow(/https/);
    setDmsHostResolver(async () => ["10.0.0.7"]);
    await expect(assertPublicDmsUrl("https://dms.example.com")).rejects.toThrow(/internes Netz/);
  });

  it("re-checks every redirect hop and never follows one into the internal network", async () => {
    setDmsHostResolver(async (host) =>
      host === "internal.example.com" ? ["10.0.0.9"] : ["93.184.216.34"]
    );
    const fetchMock = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "https://internal.example.com/x" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(dmsSafeFetch("https://dms.example.com/doc")).rejects.toThrow(/internes Netz/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops credentials on a cross-origin redirect", async () => {
    const calls: Array<{ url: string; headers?: HeadersInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, headers: init?.headers });
        return calls.length === 1
          ? new Response(null, { status: 302, headers: { location: "https://cdn.example.org/f" } })
          : new Response("ok");
      })
    );
    const res = await dmsSafeFetch("https://dms.example.com/doc", {
      headers: { Authorization: "Bearer secret" },
    });
    expect(res.status).toBe(200);
    expect(calls[1]!.headers).toBeUndefined();
  });
});
