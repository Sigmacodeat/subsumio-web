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

  it.each([
    // IPv4-mapped, dotted and hex notation
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::FFFF:7F00:0001",
    "0:0:0:0:0:ffff:7f00:1",
    "::ffff:a9fe:a9fe",
    "::ffff:169.254.169.254",
    "::ffff:a00:1",
    "::ffff:0.0.0.0",
    // IPv4-translated
    "::ffff:0:7f00:1",
    // IPv4-compatible and other ::/96 forms
    "::127.0.0.1",
    "::7f00:1",
    "::8.8.8.8",
    "::",
    "0:0:0:0:0:0:0:1",
    "0000:0000:0000:0000:0000:0000:0000:0001",
    // 0.0.0.0/8
    "0.1.2.3",
    // 6to4 with an internal IPv4 inside, NAT64, Teredo, discard, documentation
    "2002:7f00:1::",
    "2002:a9fe:a9fe::1",
    "64:ff9b::7f00:1",
    "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    "100::1",
    "2001:db8::1",
    // scoped / local IPv6
    "fe80::1%eth0",
    "[fe80::1%25en0]",
    "fec0::1",
    "fc00::1",
    "ff02::1",
    // not an address at all
    "localhost",
    "",
  ])("blocks internal or unusual address %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it("allows a public address", () => {
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
    expect(isBlockedAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
    expect(isBlockedAddress("::ffff:93.184.216.34")).toBe(false);
    expect(isBlockedAddress("2002:5db8:d822::1")).toBe(false);
  });

  it.each([
    "https://[::ffff:127.0.0.1]/",
    "https://[::ffff:7f00:1]/",
    "https://[::ffff:a9fe:a9fe]/",
    "https://[::127.0.0.1]/",
    "https://[2002:7f00:1::]/",
    "https://[0:0:0:0:0:ffff:a00:1]/",
    "https://[::1]/",
    "https://[0::1]/",
    "https://0.0.0.0/",
    "https://0/",
    "https://2130706433/",
    "https://0x7f.1/",
  ])("rejects an IP-literal URL pointing inside: %s", async (url) => {
    await expect(assertPublicDmsUrl(url)).rejects.toThrow(/internes Netz/);
  });

  it("rejects a host whose DNS answer is an IPv4-mapped internal address", async () => {
    setDmsHostResolver(async () => ["::ffff:7f00:1"]);
    await expect(assertPublicDmsUrl("https://dms.example.com")).rejects.toThrow(/internes Netz/);
  });

  it("does not follow a redirect to an IPv4-mapped loopback address", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "https://[::ffff:7f00:1]/x" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(dmsSafeFetch("https://dms.example.com/doc")).rejects.toThrow(/internes Netz/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
