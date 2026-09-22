#!/usr/bin/env tsx
/**
 * CI Guard: Verify every marketing content link resolves to a real route.
 *
 * Marketing chrome (nav, footer, mega-menu, CTAs) renders every content href
 * through `p()` from src/content/site.ts, which prefixes the path with /at.
 * A content href without a matching `src/app/at/**` route silently ships a
 * 404 in the nav or footer on every marketing page — this guard fails on it.
 *
 * It also scans src/app/at/** and src/components/marketing/** for literal
 * `href="/..."` that do NOT start with the canonical /at prefix (or an
 * explicitly non-marketing prefix like /dashboard), which would bypass the
 * canonical locale tree.
 *
 * Usage: npx tsx scripts/check-canonical-links.ts
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const SRC_ROOT = join(process.cwd(), "src");
const AT_ROOT = join(SRC_ROOT, "app", "at");
const DE_ROOT = join(SRC_ROOT, "app", "de");
const SITE_CONTENT = join(SRC_ROOT, "content", "site.ts");
const SITE_DE_CONTENT = join(SRC_ROOT, "content", "site-de.ts");

// Hrefs that intentionally leave the marketing shell (app routes, not /at).
const NON_MARKETING_PREFIXES = ["/dashboard", "/portal", "/api", "/admin", "/demo"];
// AT-only routes — Austrian-law content (blog cites §§ 9/10 RAO, the docs
// handbook documents AT statutes) intentionally has no /de twin. Nav/footer
// for the German market filter these in site-de.ts.
const AT_ONLY_PREFIXES = ["/blog", "/docs"];
const isExternal = (h: string) =>
  h.startsWith("http") || h.startsWith("mailto:") || h.startsWith("tel:") || h.startsWith("#");

/** True when the canonical /{market} path maps to a real App Router route. */
function marketRouteExists(market: "at" | "de", marketPath: string): boolean {
  const root = market === "at" ? AT_ROOT : DE_ROOT;
  const dir = join(root, marketPath === `/${market}` ? "" : marketPath.slice(3));
  return (
    existsSync(join(dir, "page.tsx")) ||
    existsSync(join(dir, "page.ts")) ||
    existsSync(join(dir, "route.ts"))
  );
}

interface Issue {
  file: string;
  line: number;
  href: string;
  issue: string;
}

const issues: Issue[] = [];

// --- 1. Content hrefs in site.ts resolve under /at AND /de -----------------
// Content hrefs are market-relative ("/features") — they must resolve in both
// markets. AT-only routes (blog/docs) are exempt: the DE nav/footer filters
// them in site-de.ts, which the second scan below verifies never links them.
const siteSrc = readFileSync(SITE_CONTENT, "utf-8");
const hrefRe = /href:\s*"([^"]+)"/g;
let m: RegExpExecArray | null;
let checked = 0;
while ((m = hrefRe.exec(siteSrc))) {
  const href = m[1];
  if (isExternal(href) || !href.startsWith("/")) continue;
  if (NON_MARKETING_PREFIXES.some((p) => href === p || href.startsWith(`${p}/`))) continue;
  checked++;
  for (const market of ["at", "de"] as const) {
    if (market === "de" && AT_ONLY_PREFIXES.some((p) => href === p || href.startsWith(`${p}/`)))
      continue;
    const marketPath = href === "/" ? `/${market}` : `/${market}${href}`;
    if (!marketRouteExists(market, marketPath)) {
      const line = siteSrc.slice(0, m.index).split("\n").length;
      issues.push({
        file: "src/content/site.ts",
        line,
        href,
        issue: `resolves to ${marketPath} but no src/app${marketPath}/page.tsx exists`,
      });
    }
  }
}
console.log(
  `[check-canonical-links] Checked ${checked} content hrefs in src/content/site.ts (both markets)`
);

// --- 2. Literal hrefs under /at pages + marketing components ---------------
function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(tsx|ts)$/.test(entry)) files.push(full);
  }
  return files;
}

const literalRe = /href=\{?["'`](\/[^"'`{]+)["'`]\}?/g;
const literalFiles = [
  ...walk(AT_ROOT),
  ...walk(DE_ROOT),
  ...walk(join(SRC_ROOT, "components", "marketing")),
];
let literalChecked = 0;
for (const file of literalFiles) {
  const src = readFileSync(file, "utf-8");
  let lm: RegExpExecArray | null;
  while ((lm = literalRe.exec(src))) {
    const href = lm[1];
    if (isExternal(href)) continue;
    if (href.startsWith("/at/") || href === "/at" || href.startsWith("/de/") || href === "/de")
      continue;
    if (NON_MARKETING_PREFIXES.some((p) => href === p || href.startsWith(`${p}/`))) continue;
    literalChecked++;
    const line = src.slice(0, lm.index).split("\n").length;
    issues.push({
      file: file.replace(`${process.cwd()}/`, ""),
      line,
      href,
      issue:
        "non-canonical internal link — should be market-prefixed or go through p()/useMarket()",
    });
  }
}
console.log(
  `[check-canonical-links] Scanned ${literalFiles.length} files for non-canonical hrefs (${literalChecked} checked)`
);

// --- 3. German market content never links AT-only routes -------------------
// NAV_DE/FOOTER_DE in site-de.ts must filter /blog and /docs (Austrian-law
// content). A stray literal href in a DE page or override would 404.
const deFiles = [...walk(DE_ROOT), SITE_DE_CONTENT];
for (const file of deFiles) {
  const src = readFileSync(file, "utf-8");
  // site-de.ts uses object-property syntax (href: "/x"), pages use JSX (href="/x").
  const re = file.endsWith(".ts") ? /href:\s*"([^"]+)"/g : literalRe;
  let lm: RegExpExecArray | null;
  while ((lm = re.exec(src))) {
    const href = lm[1];
    if (
      AT_ONLY_PREFIXES.some(
        (p) =>
          href === p ||
          href.startsWith(`${p}/`) ||
          href === `/de${p}` ||
          href.startsWith(`/de${p}/`)
      )
    ) {
      const line = src.slice(0, lm.index).split("\n").length;
      issues.push({
        file: file.replace(`${process.cwd()}/`, ""),
        line,
        href,
        issue: "links an AT-only route — no /de twin exists (Austrian-law content)",
      });
    }
  }
}
console.log(`[check-canonical-links] Scanned ${deFiles.length} DE files for AT-only links`);

// Dynamic /at paths (e.g. `/at/blog/${post.slug}`) can't be resolved
// statically — they are validated by the route tree itself.

if (issues.length) {
  console.error(`\n[check-canonical-links] ❌ ${issues.length} broken/non-canonical link(s):`);
  for (const i of issues) {
    console.error(`  ${i.file}:${i.line}  "${i.href}" — ${i.issue}`);
  }
  process.exit(1);
}

console.log("[check-canonical-links] ✅ All marketing links resolve to canonical /at routes");
