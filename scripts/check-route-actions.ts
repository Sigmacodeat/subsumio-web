#!/usr/bin/env tsx
/**
 * CI Guard: Verify every API route under src/app/api/ uses createHandler
 * and has a valid `action` scope for RBAC.
 *
 * Fails if:
 * - A route file exports POST/GET/PUT/PATCH/DELETE without createHandler/createPublicHandler/createWebhookHandler
 * - A createHandler call is missing the `action` property
 *
 * Usage: npx tsx scripts/check-route-actions.ts
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const API_ROOT = join(process.cwd(), "src", "app", "api");
const HANDLER_WRAPPERS = [
  "createHandler",
  "createPublicHandler",
  "createWebhookHandler",
  "createScimHandler",
  "createEngineProxy",
];
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

interface RouteIssue {
  file: string;
  line: number;
  issue: string;
}

const issues: RouteIssue[] = [];
let checkedFiles = 0;

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry === "route.ts" || entry === "route.tsx") {
      files.push(fullPath);
    }
  }
  return files;
}

function checkRouteFile(filePath: string): void {
  checkedFiles++;
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // Skip cron routes — they use CRON_SECRET verification, not createHandler
  if (filePath.includes("/api/cron/")) return;

  // Skip SCIM routes — they use createScimHandler with Bearer token auth
  if (filePath.includes("/api/scim/")) return;

  // Skip internal routes — they use engine-internal auth
  if (filePath.includes("/api/internal/")) return;

  // Skip realtime/SSE — uses custom streaming auth
  if (filePath.includes("/api/realtime/")) return;

  // Check if file exports any HTTP method handlers
  const hasHttpExport = HTTP_METHODS.some((method) =>
    new RegExp(`export\\s+(const|async\\s+function)\\s+${method}\\b`).test(content)
  );

  if (!hasHttpExport) return;

  // Check if file uses any of the handler wrappers
  const usesHandlerWrapper = HANDLER_WRAPPERS.some((wrapper) => content.includes(wrapper));

  if (!usesHandlerWrapper) {
    // Check if it's a raw export (not using createHandler)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const method of HTTP_METHODS) {
        if (new RegExp(`export\\s+(const|async\\s+function)\\s+${method}\\b`).test(line)) {
          issues.push({
            file: relative(process.cwd(), filePath),
            line: i + 1,
            issue: `${method} exported without createHandler wrapper — missing RBAC/action scope`,
          });
        }
      }
    }
    return;
  }

  // Check if createHandler calls have `action` property
  // (createScimHandler and createPublicHandler are excluded — they use different auth)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Only check createHandler (not createScimHandler, createPublicHandler, createWebhookHandler)
    if (
      line.includes("createHandler(") &&
      !line.includes("createPublicHandler") &&
      !line.includes("createWebhookHandler") &&
      !line.includes("createScimHandler")
    ) {
      // Look at the next ~15 lines for the `action` property
      const block = lines.slice(i, i + 20).join("\n");
      if (!/action\s*:/i.test(block)) {
        issues.push({
          file: relative(process.cwd(), filePath),
          line: i + 1,
          issue: "createHandler call missing `action` property — no RBAC scope defined",
        });
      }
    }
  }
}

function main(): void {
  if (!statSync(API_ROOT).isDirectory()) {
    console.error(`[check-route-actions] API root not found: ${API_ROOT}`);
    process.exit(1);
  }

  const routeFiles = walk(API_ROOT);
  for (const file of routeFiles) {
    checkRouteFile(file);
  }

  console.log(`\n[check-route-actions] Checked ${checkedFiles} route files in src/app/api/`);

  if (issues.length === 0) {
    console.log("[check-route-actions] ✅ All routes use createHandler with valid action scope");
    process.exit(0);
  }

  console.error(`[check-route-actions] ❌ Found ${issues.length} issue(s):\n`);
  for (const issue of issues) {
    console.error(`  ${issue.file}:${issue.line} — ${issue.issue}`);
  }
  process.exit(1);
}

main();
