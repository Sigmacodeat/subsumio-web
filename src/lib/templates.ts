/**
 * Vorlagen-Engine: `{{variable}}`-Platzhalter in Vorlagentexten mit
 * Akten- und Kanzleidaten befüllen.
 *
 * Vorher konnte eine Vorlage nur unverändert in die Zwischenablage kopiert
 * werden (templates/page.tsx:copyTemplate) — die im Vorlagenmodell
 * definierten `variables` (key/label/required) wurden nirgends benutzt,
 * obwohl die Eingabehilfe im Editor selbst schon `{{variablen}}` als
 * Syntax ankündigt (content/dashboard.ts, "templates.ph_body").
 */

import type { CaseFrontmatter } from "@/lib/legal-types";
import type { KanzleiSettings } from "@/lib/kanzlei-settings";

/** Alle `{{key}}`-Tokens einer Vorlage, in Auftrittsreihenfolge, ohne Duplikate. */
export function extractVariableKeys(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of body.matchAll(/\{\{\s*([a-zA-Z0-9_äöüÄÖÜß]+)\s*\}\}/g)) {
    const key = m[1];
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/** Ersetzt `{{key}}` durch den Wert aus `values` (fehlende Werte bleiben als Platzhalter stehen). */
export function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_äöüÄÖÜß]+)\s*\}\}/g, (match, key: string) => {
    const v = values[key];
    return v !== undefined && v.trim() !== "" ? v : match;
  });
}

/**
 * Maskiert Markdown-Steuerzeichen in einem Platzhalterwert, damit z. B. ein
 * Firmenname „Müller_Bau_GmbH“ oder „*Neu*“ beim Word-Export wörtlich und
 * nicht als Formatierung erscheint (docx-export versteht `\x`-Escapes).
 */
export function escapeMarkdownValue(value: string): string {
  return value
    .replace(/[\\`*_[\]#>|~]/g, "\\$&")
    .replace(/^(\s*)([-+])(\s)/gm, "$1\\$2$3")
    .replace(/^(\s*\d+)\.(\s)/gm, "$1\\.$2");
}

/** Wie fillTemplate, aber mit maskierten Werten — für Markdown-Ausgaben (Word-Export). */
export function fillTemplateMarkdown(body: string, values: Record<string, string>): string {
  const escaped: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    escaped[k] = v !== undefined && v.trim() !== "" ? escapeMarkdownValue(v) : v;
  }
  return fillTemplate(body, escaped);
}

/** True, wenn nach dem Befüllen noch offene `{{...}}`-Platzhalter übrig sind. */
export function hasUnfilledVariables(filledBody: string): boolean {
  return /\{\{\s*[a-zA-Z0-9_äöüÄÖÜß]+\s*\}\}/.test(filledBody);
}

const eur = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

function kanzleiAdresse(s: KanzleiSettings | null | undefined): string {
  if (!s) return "";
  const line = [s.street, [s.zip, s.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return line;
}

/**
 * Bekannte Variablenschlüssel (deutsche Konventionen, case-insensitive) →
 * Wert aus Akte und Kanzlei-Einstellungen. Erkennt mehrere gängige
 * Synonyme pro Feld, da Vorlagenautoren die Schlüssel frei benennen. Nicht
 * erkannte Schlüssel bleiben unbefüllt und werden im Formular manuell
 * abgefragt.
 */
export function resolveKnownVariables(
  caseData: (CaseFrontmatter & { title?: string; slug?: string }) | null | undefined,
  kanzlei: KanzleiSettings | null | undefined
): Record<string, string> {
  // Wiener Datum — der Server läuft in UTC; zwischen 0 und 2 Uhr hätte ein
  // Schreiben sonst das Datum des Vortags.
  const today = new Date().toLocaleDateString("de-AT", { timeZone: "Europe/Vienna" });
  const out: Record<string, string> = {
    datum: today,
    heute: today,
  };
  if (kanzlei) {
    out.kanzlei_name = kanzlei.kanzleiName ?? "";
    out.kanzlei_adresse = kanzleiAdresse(kanzlei);
    out.kanzlei_telefon = kanzlei.kanzleiTelefon ?? "";
    out.kanzlei_email = kanzlei.kanzleiEmail ?? "";
    out.kanzlei_uid = kanzlei.ustId ?? "";
    out.uid = kanzlei.ustId ?? "";
  }
  if (caseData) {
    const client = caseData.client_name ?? "";
    const opponent = caseData.opponent_name ?? "";
    const az = caseData.case_number ?? "";
    const gericht = caseData.court_name ?? "";
    const anwalt = caseData.own_lawyer_name ?? "";
    out.mandant = client;
    out.mandant_name = client;
    out.klient = client;
    out.klient_name = client;
    out.gegner = opponent;
    out.gegner_name = opponent;
    out.beklagter = opponent;
    out.beklagte = opponent;
    out.aktenzeichen = az;
    out.az = az;
    out.geschaeftszahl = az;
    out.gz = az;
    out.gericht = gericht;
    out.gericht_name = gericht;
    out.rechtsanwalt = anwalt;
    out.anwalt = anwalt;
    out.anwalt_name = anwalt;
    out.unser_anwalt = anwalt;
    if (typeof caseData.dispute_value === "number") {
      out.streitwert = eur(caseData.dispute_value);
    }
    if (caseData.title) {
      out.akte = caseData.title;
      out.aktentitel = caseData.title;
    }
  }
  return out;
}
