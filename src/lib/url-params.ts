/**
 * Append a query parameter to a relative or absolute URL that may already
 * carry a query string (`/api/dms/content?id=7` + `inline=1` →
 * `/api/dms/content?id=7&inline=1`, never a second "?").
 */
export function withQueryParam(url: string, key: string, value: string): string {
  const [base, hash = ""] = url.split("#", 2) as [string, string?];
  const sep = base.includes("?") ? (base.endsWith("?") || base.endsWith("&") ? "" : "&") : "?";
  const param = `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  return `${base}${sep}${param}${hash ? `#${hash}` : ""}`;
}
