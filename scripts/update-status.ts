#!/usr/bin/env tsx
/**
 * Regenerates the "## Verifikation" section of docs/STATUS.md from repo
 * facts (route count, git HEAD, today's date) so the management-facing
 * status doc does not silently drift from the codebase.
 *
 * Usage: bun run status
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";

const DOC = resolve(process.cwd(), "docs/STATUS.md");
const API_DIR = resolve(process.cwd(), "src/app/api");

function countRoutes(dir: string): number {
  let n = 0;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) n += countRoutes(p);
    else if (entry === "route.ts" || entry === "route.tsx") n++;
  }
  return n;
}

const routes = countRoutes(API_DIR);
const sha = execSync("git rev-parse --short=10 HEAD").toString().trim();
const date = new Date().toISOString().slice(0, 10);

const marker = "## Verifikation";
const doc = readFileSync(DOC, "utf8");
const idx = doc.indexOf(marker);
if (idx < 0) {
  console.error(`[update-status] '${marker}' section not found in ${DOC}`);
  process.exit(1);
}

const verification = `${marker}

Generiert von \`bun run status\` am ${date} (Commit \`${sha}\`).

- **API-Routen:** ${routes} (gezählt aus \`src/app/api/**/route.ts\`)
- **Verify:** \`bun run verify\` — TypeScript, Route-Actions, Grounding-
  Invariant, Design-Tokens, Canonical-Links, Nested-Interactive
- **Tests:** \`bun run test:unit\` (vitest, inkl. DAV-Bridge-Smoke-Test)

Detail-Nachweis: \`docs/blueprints/MARKT-PARITAET-2026-09-22.md\`,
Deploy-Crons: \`docs/deploy/CRON_SCHEDULE.md\`.
`;

writeFileSync(DOC, `${doc.slice(0, idx)}${verification}`);
console.log(`[update-status] ${DOC}: ${routes} routes, HEAD ${sha}, ${date}`);
