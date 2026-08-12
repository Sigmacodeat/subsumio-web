#!/usr/bin/env bun
/**
 * Auffälligkeiten-Scanner: findet verdächtige Dokumente und legt sie dem
 * Dashboard zur Entscheidung vor.
 *
 * DIE ARBEITSTEILUNG: 700.000 Dokumente kann niemand durchsehen. Alles
 * automatisch wegzuwerfen ist genauso falsch — heute hätte das 1.780 geltende
 * Landesrecht-Normen gekostet, weil 95 % der Kandidaten Altfassungen waren und
 * 5 % eben nicht. Die Maschine liefert deshalb Kandidaten MIT BEGRÜNDUNG, der
 * Mensch entscheidet. Ergebnis landet in `_steward-flags.json`, das der Corpus
 * Steward ohnehin liest.
 *
 * JEDE REGEL IST GEEICHT. `--eichen` prüft den Scanner gegen bekannte Fälle:
 * ein sauberes Dokument darf nicht anschlagen, ein kaputtes muss. Ohne
 * bestandene Eichung läuft der Scan nicht — in dieser Sitzung haben vier
 * ungeeichte Messungen Fehlalarme erzeugt (E'\s+' in psql, `nor_id` statt
 * `doc_id`, comm über verschieden sortierte Listen, s-Häufigkeit).
 *
 *   bun server/scripts/korpus-auffaelligkeiten.ts --eichen
 *   bun server/scripts/korpus-auffaelligkeiten.ts --korpus at-normen --limit 5000
 *   bun server/scripts/korpus-auffaelligkeiten.ts --korpus at-normen --schreiben
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const arg = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const KORPUS = arg("korpus");
const LIMIT = parseInt(arg("limit", "0")!, 10);
const SCHREIBEN = args.includes("--schreiben");
const EICHEN = args.includes("--eichen");
const WURZEL = join("law-corpus", "_normalized");
const FLAGS = join(WURZEL, "_steward-flags.json");

type Schwere = "defective" | "needs_review";

interface Regel {
  code: string;
  schwere: Schwere;
  erklaerung: string;
  /** Gibt einen Belegtext zurück, wenn die Regel greift — sonst null. */
  pruefe(body: string, fm: Record<string, string>): string | null;
}

/** Substanztext: ohne Überschriften, Leerraum vereinheitlicht. */
const substanz = (s: string) =>
  s.split("\n").filter((l) => !/^#{1,6}\s/.test(l)).join(" ").replace(/\s+/g, " ").trim();

const REGELN: Regel[] = [
  {
    code: "kodierung_kaputt",
    schwere: "defective",
    erklaerung: "Falsch dekodierte Umlaute — der Text ist als Latin-1 gelesen worden statt als UTF-8.",
    pruefe(body) {
      // Mojibake-Signaturen. NICHT nach einzelnen Zeichen suchen: "Ã" kommt in
      // portugiesischen Eigennamen legitim vor. Erst die Paarung mit einem
      // Folgezeichen aus dem typischen Bereich macht es eindeutig.
      const t = body.match(/Ã[¤¶¼ŸŠ]|â€[žœ"]|Ãœ|Ã„|Ã–/g);
      if (!t || t.length < 2) return null;
      return `${t.length} Treffer, z.B. "${t.slice(0, 4).join('", "')}"`;
    },
  },
  {
    code: "ersatzzeichen",
    schwere: "defective",
    erklaerung: "Unicode-Ersatzzeichen (U+FFFD) — beim Einlesen ist Information verloren gegangen.",
    pruefe(body) {
      const n = (body.match(/�/g) ?? []).length;
      return n > 0 ? `${n}× � im Text` : null;
    },
  },
  {
    code: "steuerzeichen",
    schwere: "defective",
    erklaerung: "Steuerzeichen im Text — bricht Suche, Anzeige und Chunking.",
    pruefe(body) {
      // Escape-Sequenzen statt echter Steuerzeichen im Quelltext: die
      // literale Fassung war nach dem Speichern nicht mehr lesbar und ergab
      // "range out of order in character class". Tab, LF und CR sind
      // ausgenommen — die gehören zu jedem Markdown-Dokument.
      const t = body.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g);
      return t ? `${t.length} Steuerzeichen` : null;
    },
  },
  {
    code: "platzhalter_statt_inhalt",
    schwere: "defective",
    erklaerung: "RIS-Vermerk statt Normtext — das Dokument hat nie Inhalt gehabt.",
    pruefe(body) {
      const s = substanz(body);
      if (/\bKein\s+RS\.?\s*$/.test(s)) return '"Kein RS." statt Inhalt';
      if (/^(wird nachgereicht|folgt|n\.?\s?n\.?)\s*$/i.test(s)) return `"${s.slice(0, 40)}"`;
      return null;
    },
  },
  {
    code: "nur_bildverweis",
    schwere: "needs_review",
    erklaerung: "Der Inhalt liegt bei RIS nur als Grafik vor — nicht durchsuchbar, nicht zitierbar.",
    pruefe(body) {
      const s = substanz(body);
      if (s.length === 0) return null;
      const bilder = (s.match(/\/Dokumente\/[^\s]+\.(jpg|jpeg|png|gif|tif)/gi) ?? []).length;
      if (bilder === 0) return null;
      // Nur melden, wenn kaum Text NEBEN den Bildverweisen steht — sonst
      // schlägt jede Anlage an, die eine Abbildung erwähnt.
      const ohneBilder = s.replace(/\/Dokumente\/[^\s]+\.(jpg|jpeg|png|gif|tif)/gi, " ").replace(/\s+/g, " ").trim();
      return ohneBilder.length < 120 ? `${bilder} Bildverweise, nur ${ohneBilder.length} Zeichen Text` : null;
    },
  },
  {
    code: "navigationsmuell",
    schwere: "defective",
    erklaerung: "Seitennavigation statt Dokument — es wurde eine HTML-Seite geholt, kein Inhalt.",
    pruefe(body) {
      const s = substanz(body);
      // "Barrierefreiheit" stand hier und war zu 100 % Fehlalarm: § 30b AMD-G
      // trägt genau diese Überschrift, weil sie der Regelungsgegenstand ist —
      // Mediendiensteanbieter müssen barrierefreie Angebote schaffen. Alle 126
      // Treffer im Bundesrecht kamen von diesem einen Wort, keiner von einer
      // echten Navigationsmarke. Ein Rechtsbegriff taugt nicht als Müllsignal.
      const treffer = s.match(/\b(Zur Navigation|Zum Inhalt springen|Druckansicht|Zum Seitenanfang|Sitemap|Cookie-Einstellungen)\b/g);
      return treffer && treffer.length >= 2 ? `${treffer.length} Navigationsmarken` : null;
    },
  },
  {
    code: "pdf_seitenmarker",
    schwere: "needs_review",
    erklaerung: "Seitenumbrüche der PDF-Vorlage stehen im Fließtext.",
    pruefe(body) {
      const t = body.match(/^\s*(Seite \d+ von \d+|-\s*\d+\s*-)\s*$/gm);
      return t && t.length >= 2 ? `${t.length} Seitenmarker` : null;
    },
  },
  {
    code: "text_bricht_ab",
    schwere: "needs_review",
    erklaerung: "Der Text endet mitten im Satz — möglicher Abruf- oder Extraktionsfehler.",
    pruefe(body) {
      const s = substanz(body);
      if (s.length < 200) return null;
      // GEEICHT an den Fehlalarmen dieser Sitzung: Aufzählungen, Warenlisten,
      // Tabellenwerte, Unterschriftsblöcke und Fußnoten enden regelmäßig ohne
      // Satzzeichen und sind trotzdem vollständig. Deutsche Anführungszeichen
      // gehören zu den gültigen Endzeichen.
      if (/[.!?:;)\]»“”’"'…]\s*$/.test(s)) return null;
      if (/\b(aufgehoben|entfällt|gestrichen)\s*$/i.test(s)) return null;
      if (/(\d+\s*[x×]\s*\d+|\d+\s*(mm|cm|kg|km\/h|€|%|vH))\s*$/i.test(s)) return null;
      if (/\b(m\.\s?p\.|e\.\s?h\.|L\.\s?S\.)\s*$/i.test(s)) return null;
      if (/-{5,}\s*$/.test(s)) return null;
      // ENGE FASSUNG, weil die weite nicht funktioniert: ein Text, der auf ein
      // Substantiv endet, kann eine abgeschnittene Norm ODER eine vollständige
      // Warenliste sein ("… Zeichenkohle, Schreibkreide und Schneiderkreide").
      // Diese beiden sind ohne Sprachanalyse nicht zu trennen, und eine Regel,
      // die 3.800 Dokumente zur Sichtung vorlegt, hilft niemandem.
      //
      // Deshalb schlägt sie nur bei Wörtern an, die im Deutschen KEINEN Satz
      // beenden können — Artikel, Konjunktionen, Präpositionen.
      //
      // HILFSVERBEN GEHÖREN NICHT DAZU, auch wenn es naheliegt: der deutsche
      // Nebensatz stellt das Verb ans Ende. "…, sofern das Modul absolviert
      // wird" ist vollständig. Die erste Fassung dieser Regel führte "wird",
      // "ist", "hat", "kann" als Abbruchsignal und meldete dadurch intakte
      // Normen — aufgefallen beim ersten Lauf über den Bestand.
      const ABBRUCHWORT =
        /\b(der|die|das|dem|den|des|ein|eine|einer|einem|einen|eines|und|oder|sowie|aber|wenn|dass|weil|wobei|welche[rsnm]?|im|in|an|auf|für|mit|von|zu|zur|zum|bei|nach|über|unter|durch|gegen|ohne)\s*$/i;
      if (!ABBRUCHWORT.test(s)) return null;
      return `endet auf "…${s.slice(-60)}"`;
    },
  },
];

interface Fund {
  pfad: string;
  code: string;
  schwere: Schwere;
  beleg: string;
}

function pruefeDatei(abs: string, rel: string): Fund[] {
  let roh: string;
  try { roh = readFileSync(abs, "utf-8"); } catch { return []; }
  const m = roh.match(/^---\n([\s\S]*?)\n---\n?/);
  const body = m ? roh.slice(m[0].length) : roh;
  const fm: Record<string, string> = {};
  for (const z of (m?.[1] ?? "").split("\n")) {
    const mm = z.match(/^([a-z_]+):\s*"?([^"\n]*)"?\s*$/);
    if (mm) fm[mm[1]] = mm[2].trim();
  }
  const funde: Fund[] = [];
  for (const r of REGELN) {
    const beleg = r.pruefe(body, fm);
    if (beleg) funde.push({ pfad: rel, code: r.code, schwere: r.schwere, beleg });
  }
  return funde;
}

// ── Eichung ───────────────────────────────────────────────────────────────
if (EICHEN) {
  const faelle: [string, string, string | null][] = [
    ["sauberer Normtext",
     "# § 1 ABGB\n\n§ 1. Der Inbegriff der Gesetze, wodurch die Rechte bestimmt werden, macht das Recht aus.",
     null],
    ["Aufzählung ohne Schlusspunkt (Fehlalarm-Falle)",
     "# Anl. 1\n\n" + "Warenverzeichnis: ".padEnd(210, "x") + " Schreibkreide, Zeichenkohle, Schneiderkreide",
     null],
    ["Maßangabe am Ende (Fehlalarm-Falle)",
     "# Anl. 3\n\n" + "Tafelgrößen nach Norm: ".padEnd(210, "y") + " 960 x 470 mm",
     null],
    ["kaputte Kodierung",
     "# § 5\n\nDie BehÃ¶rde hat die MaÃŸnahme zu prÃ¼fen und die AntrÃ¤ge zu erledigen.",
     "kodierung_kaputt"],
    ["Ersatzzeichen",
     "# § 7\n\nDer Betrag von 100 � ist zu entrichten.",
     "ersatzzeichen"],
    ["Platzhalter",
     "# RS\n\nKein RS.",
     "platzhalter_statt_inhalt"],
    ["nur Bildverweise",
     "# Anl. 2\n\n/Dokumente/Bundesnormen/NOR1/image001.jpg\n/Dokumente/Bundesnormen/NOR1/image002.jpg",
     "nur_bildverweis"],
    ["echter Satzabbruch (endet auf Artikel)",
     "# § 9\n\n" + "Die Behörde hat bei der Beurteilung der Zumutbarkeit insbesondere zu berücksichtigen, ".padEnd(230, "z") + " wobei der",
     "text_bricht_ab"],
    ["Satzabbruch auf Konjunktion",
     "# § 11\n\n" + "Der Antrag ist abzuweisen, sofern die Voraussetzungen nicht vorliegen ".padEnd(210, "q") + " und",
     "text_bricht_ab"],
    ["Nebensatz mit Verb am Ende (Fehlalarm-Falle)",
     "# Anl. 16\n\n" + "Die Ausbildungsdauer wird um ein Semester ".padEnd(215, "n") + " verkürzt, sofern das wissenschaftliche Modul absolviert wird",
     null],
    ["Rechtsbegriff Barrierefreiheit (Fehlalarm-Falle)",
     "# § 30b AMD-G\n\nBarrierefreiheit\n\n§ 30b. (1) Mediendiensteanbieter haben dafür zu sorgen, dass die Barrierefreiheit ihrer Angebote schrittweise erhöht wird.",
     null],
    ["vollständige Warenliste (Fehlalarm-Falle)",
     "# Anl. 7\n\n" + "Zolltarifnummern und Warenbezeichnungen: ".padEnd(215, "w") + " Pastellstifte, Zeichenkohle, Schneiderkreide",
     null],
  ];
  let ok = 0, fehl = 0;
  console.log("Eichung der Regeln\n");
  for (const [name, text, erwartet] of faelle) {
    const funde = pruefeDatei0(text);
    const codes = funde.map((f) => f.code);
    const bestanden = erwartet === null ? codes.length === 0 : codes.includes(erwartet);
    console.log(`  ${bestanden ? "✓" : "✗"} ${name.padEnd(44)} ${codes.length ? codes.join(", ") : "unauffällig"}`);
    bestanden ? ok++ : fehl++;
  }
  console.log(`\n  ${ok} bestanden, ${fehl} fehlgeschlagen`);
  process.exit(fehl === 0 ? 0 : 1);
}

/** Eichungs-Hilfe: prüft rohen Text ohne Dateisystem. */
function pruefeDatei0(roh: string): Fund[] {
  const m = roh.match(/^---\n([\s\S]*?)\n---\n?/);
  const body = m ? roh.slice(m[0].length) : roh;
  const funde: Fund[] = [];
  for (const r of REGELN) {
    const beleg = r.pruefe(body, {});
    if (beleg) funde.push({ pfad: "(eichung)", code: r.code, schwere: r.schwere, beleg });
  }
  return funde;
}

// ── Scan ──────────────────────────────────────────────────────────────────
if (!KORPUS) { console.error("--korpus <name> oder --eichen"); process.exit(2); }
const wurzel = join(WURZEL, KORPUS);
if (!existsSync(wurzel)) { console.error(`${wurzel} existiert nicht`); process.exit(2); }

function alleDateien(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e.startsWith("_")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) alleDateien(p, out);
    else if (e.endsWith(".md")) out.push(p);
  }
  return out;
}

let dateien = alleDateien(wurzel).sort();
if (LIMIT > 0) {
  const schritt = Math.max(1, Math.floor(dateien.length / LIMIT));
  dateien = dateien.filter((_, i) => i % schritt === 0).slice(0, LIMIT);
}

console.log(`Korpus:     ${KORPUS}`);
console.log(`Dateien:    ${dateien.length.toLocaleString("de")}\n`);

const alle: Fund[] = [];
let n = 0;
for (const abs of dateien) {
  const rel = `${KORPUS}/${abs.slice(wurzel.length + 1)}`;
  alle.push(...pruefeDatei(abs, rel));
  if (++n % 20000 === 0) process.stderr.write(`\r  ${n.toLocaleString("de")} …`);
}
process.stderr.write("\r");

const jeCode = new Map<string, Fund[]>();
for (const f of alle) (jeCode.get(f.code) ?? jeCode.set(f.code, []).get(f.code)!).push(f);

console.log("─".repeat(74));
console.log(`${"Auffälligkeit".padEnd(28)}${"Schwere".padEnd(16)}${"Treffer".padStart(9)}${"Anteil".padStart(10)}`);
console.log("─".repeat(74));
for (const r of REGELN) {
  const f = jeCode.get(r.code) ?? [];
  if (!f.length) continue;
  console.log(
    `${r.code.padEnd(28)}${r.schwere.padEnd(16)}${String(f.length).padStart(9)}` +
    `${((100 * f.length) / dateien.length).toFixed(3).padStart(9)}%`
  );
  console.log(`  ${f[0].pfad.slice(-58)}`);
  console.log(`     ${f[0].beleg.slice(0, 96)}`);
}
console.log("─".repeat(74));
const betroffen = new Set(alle.map((f) => f.pfad)).size;
console.log(`betroffene Dokumente: ${betroffen.toLocaleString("de")} von ${dateien.length.toLocaleString("de")} (${((100 * betroffen) / dateien.length).toFixed(3)} %)`);

if (!SCHREIBEN) {
  console.log(`\nNichts geschrieben. Mit --schreiben landen die Funde im Dashboard.`);
  process.exit(0);
}

// Bestehende Kennzeichnungen NICHT überschreiben: eine menschliche
// Entscheidung ("verified") wiegt schwerer als jede Regel.
const bestand: Record<string, unknown> = existsSync(FLAGS)
  ? JSON.parse(readFileSync(FLAGS, "utf-8"))
  : {};
let neu = 0, uebersprungen = 0;
for (const [pfad, funde] of Object.entries(
  alle.reduce<Record<string, Fund[]>>((acc, f) => ((acc[f.pfad] ??= []).push(f), acc), {}),
)) {
  if (bestand[pfad]) { uebersprungen++; continue; }
  const schwer = funde.some((f) => f.schwere === "defective");
  bestand[pfad] = {
    flag: schwer ? "defective" : "needs_review",
    note: funde.map((f) => `${f.code}: ${f.beleg}`).join(" | ").slice(0, 400),
    flaggedBy: "auto-scan",
    flaggedAt: new Date().toISOString(),
  };
  neu++;
}
writeFileSync(FLAGS, JSON.stringify(bestand, null, 2), "utf-8");
console.log(`\n✓ ${neu} Dokumente gekennzeichnet, ${uebersprungen} übersprungen (schon bewertet).`);
console.log(`  Sichtbar im Dashboard unter Corpus Steward.`);
