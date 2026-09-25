/**
 * Outbound guard for DMS requests. A firm admin sets the DMS address, and the
 * server fetches from it — so every request (and every redirect hop) must
 * resolve to a public address: https only, no loopback, private, link-local,
 * CGNAT, multicast or cloud-metadata targets, whatever the host name says.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type HostResolver = (host: string) => Promise<string[]>;

const defaultResolver: HostResolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

let resolver: HostResolver = defaultResolver;

/** Test seam: unit tests must not depend on real DNS. */
export function setDmsHostResolver(next: HostResolver | null): void {
  resolver = next ?? defaultResolver;
}

export class DmsEgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DmsEgressError";
  }
}

function ipv4Blocked(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved
  );
}

function ipv6Blocked(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v === "::" || v === "::1") return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Blocked(mapped[1]!);
  return (
    v.startsWith("fc") ||
    v.startsWith("fd") || // unique local
    /^fe[89ab]/.test(v) || // link-local
    v.startsWith("ff") || // multicast
    v.startsWith("64:ff9b:") // NAT64
  );
}

export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip.replace(/^\[|\]$/g, ""));
  if (kind === 4) return ipv4Blocked(ip);
  if (kind === 6) return ipv6Blocked(ip);
  return true;
}

/** Throws unless `rawUrl` is https and every address of its host is public. */
export async function assertPublicDmsUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new DmsEgressError("DMS-Adresse ist ungültig");
  }
  if (url.protocol !== "https:") throw new DmsEgressError("DMS-Adresse muss https verwenden");
  if (url.username || url.password) {
    throw new DmsEgressError("DMS-Adresse darf keine Zugangsdaten enthalten");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await resolver(host);
    } catch {
      throw new DmsEgressError("DMS-Adresse ist nicht auflösbar");
    }
  }
  if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
    throw new DmsEgressError("DMS-Adresse zeigt auf ein internes Netz");
  }
  return url;
}

const MAX_REDIRECTS = 3;

/**
 * fetch() for DMS endpoints: checks the target before each hop and follows at
 * most MAX_REDIRECTS redirects manually, re-checking every Location.
 * Credentials are not forwarded to a different origin.
 */
export async function dmsSafeFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  let current = await assertPublicDmsUrl(rawUrl);
  const origin = current.origin;
  for (let hop = 0; ; hop++) {
    const sameOrigin = current.origin === origin;
    const headers = sameOrigin ? init.headers : undefined;
    const res = await fetch(current.toString(), { ...init, headers, redirect: "manual" });
    if (res.status < 300 || res.status >= 400 || res.status === 304) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    if (hop >= MAX_REDIRECTS) throw new DmsEgressError("Zu viele Weiterleitungen vom DMS");
    current = await assertPublicDmsUrl(new URL(location, current).toString());
  }
}
