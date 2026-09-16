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
const SITE_CONTENT = join(SRC_ROOT, "content", "site.ts");

// Hrefs that intentionally leave the marketing shell (app routes, not /at).
const NON_MARKETING_PREFIXES = ["/dashboard", "/portal", "/api", "/admin"];
const isExternal = (h: string) =>
  h.startsWith("http") || h.startsWith("mailto:") || h.startsWith("tel:") || h.startsWith("#");

/** True when the canonical /at path maps to a real App Router route. */
function atRouteExists(atPath: string): boolean {
  const dir = join(AT_ROOT, atPath === "/at" ? "" : atPath.slice(3));
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

// --- 1. Content hrefs in site.ts resolve under /at -------------------------
const siteSrc = readFileSync(SITE_CONTENT, "utf-8");
const hrefRe = /href:\s*"([^"]+)"/g;
let m: RegExpExecArray | null;
let checked = 0;
while ((m = hrefRe.exec(siteSrc))) {
  const href = m[1];
  if (isExternal(href) || !href.startsWith("/")) continue;
  if (NON_MARKETING_PREFIXES.some((p) => href === p || href.startsWith(`${p}/`))) continue;
  const atPath = href === "/" ? "/at" : `/at${href}`;
  checked++;
  if (!atRouteExists(atPath)) {
    const line = siteSrc.slice(0, m.index).split("\n").length;
    issues.push({
      file: "src/content/site.ts",
      line,
      href,
      issue: `resolves to ${atPath} but no src/app${atPath}/page.tsx exists`,
    });
  }
}
console.log(`[check-canonical-links] Checked ${checked} content hrefs in src/content/site.ts`);

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
const literalFiles = [...walk(AT_ROOT), ...walk(join(SRC_ROOT, "components", "marketing"))];
let literalChecked = 0;
for (const file of literalFiles) {
  const src = readFileSync(file, "utf-8");
  let lm: RegExpExecArray | null;
  while ((lm = literalRe.exec(src))) {
    const href = lm[1];
    if (isExternal(href)) continue;
    if (href.startsWith("/at/") || href === "/at") continue;
    if (NON_MARKETING_PREFIXES.some((p) => href === p || href.startsWith(`${p}/`))) continue;
    literalChecked++;
    const line = src.slice(0, lm.index).split("\n").length;
    issues.push({
      file: file.replace(`${process.cwd()}/`, ""),
      line,
      href,
      issue: "non-canonical internal link — should be /at-prefixed or go through p()",
    });
  }
}
console.log(
  `[check-canonical-links] Scanned ${literalFiles.length} files for non-canonical hrefs (${literalChecked} checked)`
);

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
