/**
 * Outbound guard for server-side requests to addresses a firm configures
 * (DMS base URL, outgoing webhooks, …). The server fetches from them — so
 * every request (and every redirect hop) must resolve to a public address:
 * https only, no loopback, private, link-local, CGNAT, multicast or
 * cloud-metadata targets, whatever the host name says.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type HostResolver = (host: string) => Promise<string[]>;

const defaultResolver: HostResolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

let resolver: HostResolver = defaultResolver;

/** Test seam: unit tests must not depend on real DNS. */
export function setEgressHostResolver(next: HostResolver | null): void {
  resolver = next ?? defaultResolver;
}

export class EgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EgressError";
  }
}

export interface EgressOptions {
  /** Noun used in error messages, e.g. "DMS-Adresse" or "Webhook-Adresse". */
  label?: string;
  /** Redirect hops followed at most (each one re-checked). Default 3. */
  maxRedirects?: number;
  /** Error message when the redirect limit is exceeded. */
  tooManyRedirectsMessage?: string;
}

function ipv4Blocked(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p as [number, number, number, number];
  return (
    a === 0 || // 0.0.0.0/8 ("this network", reaches the local host)
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // IETF protocol assignments + TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast + reserved + broadcast
  );
}

/**
 * Parses an IPv6 literal (any notation: compressed, embedded dotted IPv4,
 * upper case) into its eight 16-bit groups. Null when it is not valid.
 */
function parseIpv6(v: string): number[] | null {
  let s = v;
  let tail: number[] = [];
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const q = dotted[2]!.split(".").map(Number);
    if (q.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    tail = [(q[0]! << 8) | q[1]!, (q[2]! << 8) | q[3]!];
    s = dotted[1]!.endsWith("::") ? dotted[1]! : dotted[1]!.slice(0, -1);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = toGroups(halves[0]!);
  const rest = halves.length === 2 ? toGroups(halves[1]!) : [];
  if (!head || !rest) return null;
  const known = head.length + rest.length + tail.length;
  if (halves.length === 2) {
    if (known > 7) return null;
    return [...head, ...new Array<number>(8 - known).fill(0), ...rest, ...tail];
  }
  return known === 8 ? [...head, ...tail] : null;
}

function embeddedIpv4(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

function ipv6Blocked(ip: string): boolean {
  const raw = ip.toLowerCase().replace(/^\[|\]$/g, "");
  // A zone id (fe80::1%eth0) only exists for scoped, i.e. local, addresses.
  if (raw.includes("%")) return true;
  const g = parseIpv6(raw);
  if (!g) return true;
  const zero = (from: number, to: number) => g.slice(from, to).every((n) => n === 0);
  // ::/96 — unspecified, loopback and IPv4-compatible (::a.b.c.d): never public.
  if (zero(0, 6)) return true;
  // ::ffff:0:0/96 — IPv4-mapped; ::ffff:0:0:0/96 — IPv4-translated.
  if (zero(0, 5) && g[5] === 0xffff) return ipv4Blocked(embeddedIpv4(g[6]!, g[7]!));
  if (zero(0, 4) && g[4] === 0xffff && g[5] === 0) return ipv4Blocked(embeddedIpv4(g[6]!, g[7]!));
  const [a, b] = g as [number, number];
  if (a === 0x64 && b === 0xff9b) return true; // NAT64 (64:ff9b::/96, 64:ff9b:1::/48)
  if (a === 0x100 && zero(1, 4)) return true; // discard-only 100::/64
  if (a === 0x2001 && b === 0) return true; // Teredo — embeds an obfuscated IPv4
  if (a === 0x2001 && b === 0xdb8) return true; // documentation
  if (a === 0x2002) return ipv4Blocked(embeddedIpv4(b, g[2]!)); // 6to4
  return (
    (a & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (a & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (a & 0xffc0) === 0xfec0 || // site-local (deprecated) fec0::/10
    (a & 0xff00) === 0xff00 // multicast
  );
}

export function isBlockedAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, "");
  if (bare.includes("%")) return true;
  const kind = isIP(bare);
  if (kind === 4) return ipv4Blocked(bare);
  if (kind === 6) return ipv6Blocked(bare);
  return true;
}

/** Throws unless `rawUrl` is https and every address of its host is public. */
export async function assertPublicUrl(rawUrl: string, opts: EgressOptions = {}): Promise<URL> {
  const label = opts.label ?? "Adresse";
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new EgressError(`${label} ist ungültig`);
  }
  if (url.protocol !== "https:") throw new EgressError(`${label} muss https verwenden`);
  if (url.username || url.password) {
    throw new EgressError(`${label} darf keine Zugangsdaten enthalten`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await resolver(host);
    } catch {
      throw new EgressError(`${label} ist nicht auflösbar`);
    }
  }
  if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
    throw new EgressError(`${label} zeigt auf ein internes Netz`);
  }
  return url;
}

const MAX_REDIRECTS = 3;

/**
 * fetch() for firm-configured endpoints: checks the target before each hop
 * and follows at most `maxRedirects` redirects manually, re-checking every
 * Location. Headers (credentials, signatures) are not forwarded to a
 * different origin.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  opts: EgressOptions = {}
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  let current = await assertPublicUrl(rawUrl, opts);
  const origin = current.origin;
  for (let hop = 0; ; hop++) {
    const sameOrigin = current.origin === origin;
    const headers = sameOrigin ? init.headers : undefined;
    const res = await fetch(current.toString(), { ...init, headers, redirect: "manual" });
    if (res.status < 300 || res.status >= 400 || res.status === 304) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    if (hop >= maxRedirects) {
      throw new EgressError(opts.tooManyRedirectsMessage ?? "Zu viele Weiterleitungen");
    }
    current = await assertPublicUrl(new URL(location, current).toString(), opts);
  }
}
