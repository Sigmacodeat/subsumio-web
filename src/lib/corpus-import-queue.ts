/**
 * Warteschlange: welche bearbeiteten Dateien noch nicht in der Datenbank sind.
 *
 * WARUM DAS NÖTIG IST: Der Corpus Steward schreibt nach
 * `law-corpus/_normalized/`. Das KI-Gehirn liest aber nicht die Dateien,
 * sondern die Tabellen `pages` und `content_chunks`. Eine Bearbeitung im
 * Dashboard war deshalb bisher unsichtbar für die Suche und für jede Antwort
 * mit Fundstelle: der Anwalt sah im Dashboard seinen korrigierten Text, das
 * Gehirn zitierte weiter den alten. Ein stiller Auseinanderlauf von Anzeige
 * und Auskunft — die gefährlichste Sorte Fehler in einem Rechts-Copilot.
 *
 * Diese Warteschlange schließt die Lücke nicht selbst, sie macht sie
 * SICHTBAR und abarbeitbar: jede Schreiboperation trägt ihren Pfad ein,
 * `/api/admin/corpus-files/publish` arbeitet sie ab, und solange etwas
 * offen ist, kann das Dashboard es anzeigen.
 *
 * Absichtlich eine Datei und keine Tabelle: die Warteschlange muss auch
 * dann lesbar sein, wenn die Datenbank gerade nicht erreichbar ist — genau
 * dann steht nämlich am meisten darin.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
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
  writeFileSync(DATEI, JSON.stringify(eintraege, null, 2), "utf-8");
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
  art: WarteEintrag["art"] = "edit",
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
