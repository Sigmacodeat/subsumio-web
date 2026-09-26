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
  // Alle öffentlichen Seiten beider Märkte (Metadaten tragen eigene Werbetexte).
  ...files("src/app/at", /^(page|layout|opengraph-image)\.tsx$/),
  ...files("src/app/de", /^(page|layout|opengraph-image)\.tsx$/),
  "src/app/demo/page.tsx",
  "src/lib/concierge/knowledge.ts",
  "src/lib/seo-keywords.ts",
  "src/components/legal/legal-content.tsx",
  "src/app/layout.tsx",
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
  // Kein kanzleibezogener Nachtlauf außer dem Judikatur-Wächter; Akten-Scan nur auf Abruf.
  [/n[äa]chtliche Prüfung/i, "kein nächtlicher Prüflauf der Akten"],
  [/Über Nacht geprüft/i, "kein nächtlicher Prüflauf der Akten"],
  [/über Nacht (in Ordnung|auf Widersprüche|erkannt)/i, "kein nächtlicher Prüflauf der Akten"],
  [/Nachts werden Aussagen/, "Widerspruchsprüfung läuft nach dem Hochladen"],
  [/[Jj]ede Nacht (geht|prüft)/, "kein nächtlicher Prüflauf der Akten"],
  [/(Am Morgen|am Morgen|Morgens) sehen Sie/, "keine morgendliche Prüfliste"],
  [/fehlende Unterlagen/i, "keine automatische Suche nach fehlenden Unterlagen"],
  // Belegte Antworten: nicht Belegtes wird gekennzeichnet — kein absolutes Versprechen.
  [
    /[Jj]ede (Antwort|Aussage) (mit|hat|nennt)[^."]{0,20}Fundstelle/,
    "absolute Fundstellen-Aussage",
  ],
  [/webERV Anbindung/i, "webERV-Versand existiert noch nicht"],
  [/versendet nichts von selbst/, "Erinnerungen gehen automatisch hinaus"],
  // Zahlen nur mit eingechecktem Messprotokoll (src/content/proof-points.ts).
  [/99,8\s?%|Recall@8/, "Kennzahl ohne Messprotokoll"],
  // Kunden-Empfehlung: es wird keine Gutschrift gebucht (Billing-Webhook).
  [/Monat gratis|Gratisjahr|ersten Monat ebenfalls gratis/i, "keine Empfehlungsgutschrift"],
];

describe("In-App-Texte — keine Empfehlungsgutschrift versprechen", () => {
  it("dashboard.ts and the signup form promise no free month", () => {
    for (const file of ["src/content/dashboard.ts", "src/components/auth/auth-form.tsx"]) {
      const src = readFileSync(join(ROOT, file), "utf8");
      expect(
        /Monat gratis|Gratisjahr|month free|free year|erster Monat[^"]*gratis/i.test(src),
        file
      ).toBe(false);
    }
  });
});

describe("Website-Aussagen — keine unhaltbaren Versprechen", () => {
  it.each(SOURCES)("%s", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    for (const [re, why] of BANNED) {
      expect(re.test(src), `${file}: ${re} (${why})`).toBe(false);
    }
  });
});
