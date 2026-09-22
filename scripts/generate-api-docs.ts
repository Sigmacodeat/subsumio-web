#!/usr/bin/env tsx
/**
 * Generiert docs/API.md — die öffentliche API-Dokumentation aus den
 * Route-Dateien unter src/app/api/. Extrahiert pro Route: HTTP-Methoden,
 * Handler-Typ (Session/Public/Webhook), Action-Scope und Rate-Tier.
 *
 * Usage: bun x tsx scripts/generate-api-docs.ts [--check]
 *   --check: schlägt fehl, wenn docs/API.md nicht aktuell ist (CI).
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const API_ROOT = join(process.cwd(), "src", "app", "api");
const OUT_FILE = join(process.cwd(), "docs", "API.md");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const WRAPPERS = [
  "createHandler",
  "createPublicHandler",
  "createWebhookHandler",
  "createScimHandler",
  "createEngineProxy",
];

const WRAPPER_AUTH: Record<string, string> = {
  createHandler: "Session",
  createPublicHandler: "Öffentlich (rate-limited)",
  createWebhookHandler: "Webhook-Signatur",
  createScimHandler: "SCIM Bearer-Token",
  createEngineProxy: "Session → Engine",
};

interface RouteDoc {
  path: string;
  methods: string[];
  auth: string;
  action: string;
  rateTier: string;
  description: string;
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (entry === "route.ts" || entry === "route.tsx") files.push(full);
  }
  return files;
}

function routePath(file: string): string {
  const rel = file.slice(API_ROOT.length).replace(/\/route\.tsx?$/, "");
  return "/api" + rel.replace(/\[([^\]]+)\]/g, "{$1}");
}

function extractDoc(file: string): RouteDoc | null {
  const content = readFileSync(file, "utf-8");
  const methods = HTTP_METHODS.filter((m) =>
    new RegExp(`export\\s+(const|async\\s+function)\\s+${m}\\b`).test(content)
  );
  if (methods.length === 0) return null;

  const wrapper = WRAPPERS.find((w) => content.includes(w)) ?? "raw";
  const action = content.match(/action:\s*"([^"]+)"/)?.[1] ?? "—";
  const rateTier = content.match(/rateTier:\s*"([^"]+)"/)?.[1] ?? "standard";
  const description =
    content.match(/^\s*\*\s+([A-ZÄÖÜ][^\n*]{20,200})/m)?.[1]?.trim() ??
    content.match(/\/\/\s*([A-ZÄÖÜ][^\n]{20,200})/)?.[1]?.trim() ??
    "";

  return {
    path: routePath(file),
    methods,
    auth: WRAPPER_AUTH[wrapper] ?? "Intern/spezial",
    action,
    rateTier,
    description,
  };
}

function generate(): string {
  const docs = walk(API_ROOT)
    .map(extractDoc)
    .filter((d): d is RouteDoc => d !== null)
    .sort((a, b) => a.path.localeCompare(b.path));

  const lines: string[] = [
    "# Subsumio API — Referenz",
    "",
    "> Automatisch generiert aus den Route-Dateien. Regenerieren:",
    "> `bun x tsx scripts/generate-api-docs.ts`",
    "",
    `**${docs.length} Endpunkte** — Stand: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "## Authentifizierung",
    "",
    "| Typ | Beschreibung |",
    "|---|---|",
    "| Session | Cookie-Session des angemeldeten Kanzlei-Nutzers |",
    "| Öffentlich | Anonyme Flächen (Intake, Portal, Booking) — IP-rate-limited |",
    "| Webhook-Signatur | Signierte Provider-Callbacks (HMAC) |",
    "| SCIM Bearer-Token | SCIM-Provisioning |",
    "",
    "## Endpunkte",
    "",
    "| Pfad | Methoden | Auth | Action | Rate |",
    "|---|---|---|---|---|",
  ];

  for (const d of docs) {
    lines.push(
      `| \`${d.path}\` | ${d.methods.join(", ")} | ${d.auth} | \`${d.action}\` | ${d.rateTier} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

const output = generate();
if (process.argv.includes("--check")) {
  const existing = readFileSync(OUT_FILE, "utf-8");
  if (existing !== output) {
    console.error("[generate-api-docs] docs/API.md ist nicht aktuell — regenerieren");
    process.exit(1);
  }
  console.log("[generate-api-docs] docs/API.md ist aktuell");
} else {
  writeFileSync(OUT_FILE, output);
  console.log(`[generate-api-docs] docs/API.md geschrieben (${output.split("\n").length} Zeilen)`);
}
