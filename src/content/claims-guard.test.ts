// Guard gegen unhaltbare Website-Aussagen (WEBSITE_TEXTREGELN.md Regel 7):
// absolute Versprechen und technische Behauptungen, die der Code nicht trägt.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function files(dir: string, re: RegExp): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = join(dir, e.name);
    if (e.isDirectory()) return files(rel, re);
    return re.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [rel] : [];
  });
}

const SOURCES = [
  ...files("src/content", /\.ts$/).filter((f) => !f.endsWith("dashboard.ts")),
  ...files("src/components/marketing", /\.tsx?$/),
  "src/lib/concierge/knowledge.ts",
  "src/app/layout.tsx",
  "src/app/at/layout.tsx",
  "src/app/at/page.tsx",
  "src/app/at/partners/page.tsx",
  "src/app/at/privacy/page.tsx",
];

const BANNED: Array<[RegExp, string]> = [
  [/keine Halluzination/i, "absolutes Versprechen"],
  [/DSGVO-konform/, "absolute Konformitätsbehauptung"],
  [/AES-256-Verschlüsselung der gespeicherten Daten/, "Datenbank ist nicht AES-verschlüsselt"],
  [/verschlüsselt übertragen und gespeichert/, "nur Originaldateien sind verschlüsselt abgelegt"],
  [/Datenstandort EU/, "KI-Verarbeitung auch außerhalb der EU"],
  [/30 Tage aufbewahrt/, "automatische Löschfrist nicht implementiert"],
  [/30 Tage Exportfrist/, "automatische Löschfrist nicht implementiert"],
  [/lebenslange Provision/, "Partnerprovision: bis zu 30 %"],
  [/Datenschutzbeauftragten unter/, "kein Datenschutzbeauftragter bestellt"],
];

describe("Website-Aussagen — keine unhaltbaren Versprechen", () => {
  it.each(SOURCES)("%s", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    for (const [re, why] of BANNED) {
      expect(re.test(src), `${file}: ${re} (${why})`).toBe(false);
    }
  });
});
