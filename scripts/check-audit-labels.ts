#!/usr/bin/env tsx
/**
 * CI Guard: jede Audit-Action im `AuditAction`-Union muss ein gepflegtes
 * deutsches Label in `ACTION_LABELS` haben. Ohne Label fällt die UI auf
 * `humaniseAuditAction` zurück — lesbar, aber nicht kuratiert (Audit-Seite,
 * Exports, Revisionssicherheit).
 *
 * Drift-Richtung: neue `logAudit("x.y")`-Callsites erzwingt tsc über den
 * Union-Typ bereits — aber niemand zwingt das Label. Dieser Check schließt
 * die Lücke: Union-Member ohne Label = Fail.
 *
 * Extra Label-Keys, die nicht im Union stehen (z.B. Engine-seitige
 * RBAC-Scopes wie `brain.read`), sind erlaubt — sie können in Audit-Exports
 * auftauchen ohne dass `logAudit` sie schreibt.
 *
 * Usage: npx tsx scripts/check-audit-labels.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

const LABELS_FILE = join(process.cwd(), "src", "lib", "audit-labels.ts");
const src = readFileSync(LABELS_FILE, "utf8");

// Union-Member: `| "action.name"` im AuditAction-Type-Literal.
const unionBlock = src.match(/export type AuditAction =([\s\S]*?);/);
if (!unionBlock) {
  console.error("[check-audit-labels] AuditAction union not found in", LABELS_FILE);
  process.exit(1);
}
const unionActions = [...unionBlock[1].matchAll(/"([a-z_]+(?:\.[a-z_]+)+)"/g)].map((m) => m[1]);

// Label-Keys: `"action.name": "…"` Einträge in ACTION_LABELS.
const labelsBlock = src.match(/ACTION_LABELS[^=]*=\s*{([\s\S]*?)};/);
if (!labelsBlock) {
  console.error("[check-audit-labels] ACTION_LABELS map not found in", LABELS_FILE);
  process.exit(1);
}
const labelled = new Set(
  [...labelsBlock[1].matchAll(/"([a-z_]+(?:\.[a-z_]+)+)"\s*:/g)].map((m) => m[1])
);

const missing = unionActions.filter((a) => !labelled.has(a));

if (missing.length > 0) {
  console.error(
    `[check-audit-labels] ${missing.length} AuditAction(s) ohne Label in ACTION_LABELS:`
  );
  for (const a of missing) console.error(`  - ${a}`);
  process.exit(1);
}

console.log(`[check-audit-labels] ${unionActions.length} audit actions, all labelled ✅`);
