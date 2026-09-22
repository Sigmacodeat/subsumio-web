import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

/**
 * DOCX-Vorlagen-Engine: `{{variable}}`-Platzhalter in .docx-Dateien mit
 * Akten-, Kanzlei- und Kontaktdaten befüllen. Gleiche Syntax wie die
 * Text-Vorlagen (`src/lib/templates.ts`), plus Loop-Support für
 * Serienbriefe ({{#empfaenger}}…{{/empfaenger}}).
 *
 * docxtemplater merged Platzhalter, die Word über mehrere Runs verteilt,
 * automatisch — darum keine manuelle Run-Normalisierung nötig.
 */

export class DocxTemplateError extends Error {}

export type DocxFillData = Record<string, string | number | boolean>;

function normalizeData(values: DocxFillData): DocxFillData {
  const out: DocxFillData = {};
  for (const [k, v] of Object.entries(values)) {
    out[k] = v === null || v === undefined ? "" : v;
  }
  return out;
}

/** Befüllt eine .docx-Vorlage und gibt das fertige Dokument als Buffer zurück. */
export function fillDocxTemplate(template: Buffer | ArrayBuffer, values: DocxFillData): Buffer {
  let zip: PizZip;
  try {
    zip = new PizZip(Buffer.isBuffer(template) ? template : Buffer.from(template));
  } catch {
    throw new DocxTemplateError("Die Datei ist keine gültige .docx-Vorlage.");
  }
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    // Fehlende Variablen bleiben leer statt Fehler — Anwalt sieht den
    // unbefüllten Bereich im Dokument und prüft ihn.
    nullGetter: () => "",
  });
  try {
    doc.render(normalizeData(values));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DocxTemplateError(`Vorlage konnte nicht befüllt werden: ${msg}`);
  }
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;

/**
 * Listet alle `{{variable}}`-Platzhalter einer .docx-Vorlage — für das
 * Serienbrief-Formular, das pro Variable ein Feld anbietet. Loop-Marker
 * ({{#…}} / {{/…}}) werden nicht als Variable gelistet.
 */
export function extractDocxVariables(template: Buffer | ArrayBuffer): string[] {
  let zip: PizZip;
  try {
    zip = new PizZip(Buffer.isBuffer(template) ? template : Buffer.from(template));
  } catch {
    throw new DocxTemplateError("Die Datei ist keine gültige .docx-Vorlage.");
  }
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    nullGetter: () => "",
  });
  const text = doc.getFullText();
  const out = new Set<string>();
  for (const m of text.matchAll(VAR_RE)) {
    const key = m[1]!;
    if (key.startsWith("#") || key.startsWith("/") || key.startsWith("^")) continue;
    out.add(key);
  }
  return [...out];
}

/**
 * Serienbrief: eine Vorlage × N Empfängerzeilen → N fertige .docx.
 * Jede Zeile liefert die Platzhalterwerte (`values`).
 */
export function fillDocxBatch(
  template: Buffer | ArrayBuffer,
  rows: Array<{ filename?: string; values: DocxFillData }>
): Array<{ filename: string; buffer: Buffer }> {
  if (rows.length === 0) {
    throw new DocxTemplateError("Serienbrief braucht mindestens eine Empfängerzeile.");
  }
  if (rows.length > 500) {
    throw new DocxTemplateError("Serienbrief ist auf 500 Empfänger pro Lauf begrenzt.");
  }
  return rows.map((row, i) => ({
    filename: row.filename?.trim() || `serienbrief-${i + 1}.docx`,
    buffer: fillDocxTemplate(template, row.values),
  }));
}
