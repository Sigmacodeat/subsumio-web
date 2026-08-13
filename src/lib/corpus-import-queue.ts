/**
 * Warteschlange: welche bearbeiteten Dateien noch nicht in der Datenbank sind.
 *
 * WARUM DAS NÖTIG IST: Der Corpus Steward schreibt nach
 * `law-corpus/_normalized/`. Die Pipeline importiert aber aus
 * `law-corpus/{dir}/` (raw). `syncToRawCorpus` in corpus-steward.ts kopiert
 * bei jeder Schreiboperation (_normalized → raw), und diese Warteschlange
 * macht den Rest sichtbar: jede Schreiboperation trägt ihren Pfad ein,
 * die `corpus-pipeline.ts` räumt die Queue via `drainImportQueue` ab
 * (nach erfolgreichem Import) und via `reconcileDeletedFiles` (für
 * gelöschte Dateien). Solange etwas offen ist, zeigt das Dashboard es an.
 *
 * Absichtlich eine Datei und keine Tabelle: die Warteschlange muss auch
 * dann lesbar sein, wenn die Datenbank gerade nicht erreichbar ist — genau
 * dann steht nämlich am meisten darin.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import { join, dirname } from "path";

const WURZEL = join(process.cwd(), "law-corpus", "_normalized");
const DATEI = join(WURZEL, "_import-warteschlange.json");

export interface WarteEintrag {
  /** Pfad relativ zu law-corpus/_normalized/, z.B. "at-normen/abgb/p-1.md" */
  pfad: string;
  /** Wer die Änderung ausgelöst hat. */
  benutzer: string;
  /** Wann sie eingetragen wurde. */
  seit: string;
  /** "edit" | "create" | "delete" — delete muss in der DB stillgelegt werden. */
  art: "edit" | "create" | "delete";
}

function lesen(): WarteEintrag[] {
  if (!existsSync(DATEI)) return [];
  try {
    const roh = JSON.parse(readFileSync(DATEI, "utf-8"));
    return Array.isArray(roh) ? roh : [];
  } catch {
    // Beschädigte Warteschlange darf den Schreibvorgang nicht blockieren —
    // sie wird beim nächsten Eintrag neu aufgebaut. Der Verlust ist
    // verschmerzbar, weil ein Vollabgleich (content_hash) die offenen
    // Änderungen ohnehin wiederfindet.
    return [];
  }
}

function schreiben(eintraege: WarteEintrag[]): void {
  if (!existsSync(dirname(DATEI))) mkdirSync(dirname(DATEI), { recursive: true });
  // Atomic write: tmp-Datei + rename. Verhindert korrupte JSON-Dateien
  // bei concurrent writes (BUG 13) und bei Abbruch mid-write.
  const tmp = `${DATEI}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(eintraege, null, 2), "utf-8");
  try {
    renameSync(tmp, DATEI);
  } catch {
    // rename fehlgeschlagen (z.B. cross-device) → fallback direkt schreiben
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    writeFileSync(DATEI, JSON.stringify(eintraege, null, 2), "utf-8");
  }
}

/**
 * Eine Datei als „muss in die Datenbank" vormerken.
 *
 * Mehrfaches Bearbeiten derselben Datei erzeugt EINEN Eintrag: die
 * Warteschlange beschreibt einen Sollzustand, keine Ereignisfolge.
 */
export function markiereZumImport(
  pfad: string,
  benutzer: string,
  art: WarteEintrag["art"] = "edit"
): void {
  const alle = lesen();
  const i = alle.findIndex((e) => e.pfad === pfad);
  const eintrag: WarteEintrag = { pfad, benutzer, seit: new Date().toISOString(), art };
  if (i >= 0) alle[i] = eintrag;
  else alle.push(eintrag);
  schreiben(alle);
}

/** Alles, was noch nicht in der Datenbank ist. */
export function offeneEintraege(): WarteEintrag[] {
  return lesen();
}

/** Nach erfolgreichem Import abräumen. Unbekannte Pfade werden ignoriert. */
export function alsImportiertMarkieren(pfade: string[]): number {
  const weg = new Set(pfade);
  const alle = lesen();
  const rest = alle.filter((e) => !weg.has(e.pfad));
  schreiben(rest);
  return alle.length - rest.length;
}
