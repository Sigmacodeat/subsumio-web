#!/usr/bin/env bun
/**
 * Inhaltsabgleich gegen die RIS-XML-Quelle.
 *
 * WOZU: Alle bisherigen Prüfungen messen unsere Daten gegen sich selbst —
 * Struktur, Metadaten, Muster. Sie können prinzipiell nicht sehen, ob Text
 * FEHLT. Der `<listelem>`-Bug ist der Beleg: `extractText()` überging
 * `<listelem>`, `<schluss>` und `<schlussteil>`, wodurch in jedem so geholten
 * Gesetz sämtliche Aufzählungen verschwanden. Die betroffenen Dokumente hatten
 * saubere Struktur, korrekte Metadaten und gültige Fundstelle — sie waren nur
 * unvollständig. Gefunden wurde das erst, als jemand die XML-Quelle holte und
 * verglich.
 *
 * Dieses Skript macht genau das systematisch: Stichprobe ziehen, XML holen,
 * mit demselben Extraktor auswerten und gegen unseren Bestand halten.
 *
 * VERGLEICHSMASS: Zeichenzahl des Substanztextes. Ein Vergleich Zeichen für
 * Zeichen würde an Normalisierung und Leerraum scheitern; entscheidend ist,
 * ob uns Inhalt fehlt.
 *
 *   bun server/scripts/verify-against-ris-xml.ts --limit 200
 *   bun server/scripts/verify-against-ris-xml.ts --source law-at-normen --limit 500
 */

import { $ } from "bun";
import { risXmlToText } from "./backfill-utils";

const args = process.argv.slice(2);
const arg = (n: string, d?: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SOURCE = arg("--source", "law-at-normen")!;
const LIMIT = parseInt(arg("--limit", "200")!, 10);
const RATE_MS = parseInt(arg("--rate-ms", "700")!, 10);
const DB = arg("--db", "subsumio_law_v2")!;
/** Ab welchem Fehlbetrag gilt ein Dokument als unvollständig (Anteil). */
const SCHWELLE = parseFloat(arg("--schwelle", "0.10")!);

if (!/^law-at[a-z-]*$/.test(SOURCE)) { console.error("Ungültige --source"); process.exit(1); }

const base = (await $`grep -hoE 'postgres://[^"'"'"' ]+subsumio_law[^"'"'"' ]*' server/.env`.quiet())
  .stdout.toString().trim().split("\n")[0];
const URL_ = base.replace(/\/[^/?]+(\?|$)/, `/${DB}$1`);
const UA = "subsumio-law-corpus/1.0 (corpus verification; contact: hello@subsum.io)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Substanztext: ohne Überschriften, Leerraum vereinheitlicht. */
const substanz = (s: string) =>
  s.split("\n").filter((l) => !/^#{1,6}\s/.test(l)).join(" ").replace(/\s+/g, " ").trim();

/**
 * Den RIS-Metadatenblock aus dem Quelltext entfernen.
 *
 * Die Quelle führt vor dem Normtext Kurztitel, Kundmachungsorgan, Typ,
 * Inkrafttretensdatum und Index, dahinter "aktualisiert am …",
 * "Gesetzesnummer …" und "Dokumentnummer …". Diese Angaben landen bei uns
 * im Frontmatter, nicht im Body — sie fehlen dort also zu Recht.
 *
 * Ohne diesen Abzug meldete der Vergleich Dokumente als unvollständig, die
 * es nicht sind: § 7 ÖSVO 2012 endet bei uns auf demselben Satz wie die
 * Quelle ("… ein Preis von 7,5 Cent/kWh bestimmt."), wurde aber mit
 * "150 statt 584 Zeichen" als 72 % fehlend ausgewiesen. Von drei von Hand
 * geprüften Funden waren zwei solche Fehlalarme.
 */
function ohneMetadaten(s: string): string {
  let t = s;
  // Kopfblock: alles bis einschließlich der "Text"-Überschrift verwerfen.
  const textMarke = t.search(/(^|\n)#{0,6}\s*Text\s*(\n|$)/);
  if (textMarke >= 0) t = t.slice(textMarke).replace(/^[^\n]*\n/, "");
  // Fußblock: ab der Aktualisierungs-/Nummernangabe abschneiden.
  t = t.replace(/\s*(zuletzt aktualisiert am|aktualisiert am)\s+\d{2}\.\d{2}\.\d{4}[\s\S]*$/i, "");
  t = t.replace(/\s*Gesetzesnummer\s+\d+[\s\S]*$/i, "");
  return t;
}

interface Doc { slug: string; xmlUrl: string; text: string }

async function main() {
  // Nur Dokumente mit XML-Quelle — sonst ist der Vergleich sinnlos.
  // Zeilenumbrüche IM Text durch ein Ersatzzeichen tauschen — sonst zerreißt
  // die zeilenweise Auswertung der psql-Ausgabe jeden mehrzeiligen Datensatz.
  // Ohne das war `unser` durchweg leer und das Skript meldete für alle 60
  // Dokumente "100 % fehlen", darunter ASVG § 49 mit 19.987 Zeichen.
  const sql = `
    select p.slug || E'\\x1f' || (p.frontmatter->>'source_url') || E'\\x1f' ||
           replace(string_agg(c.chunk_text, E'\\n' order by c.chunk_index), E'\\n', E'\\x1e')
    from pages p join content_chunks c on c.page_id = p.id
    where p.source_id = '${SOURCE}' and p.deleted_at is null
      and p.frontmatter->>'source_url' like '%.xml'
    group by p.slug, p.frontmatter->>'source_url'
    order by md5(p.slug)
    limit ${LIMIT}`;
  const raw = (await $`psql ${URL_} -tAc ${sql}`.quiet()).stdout.toString();

  const docs: Doc[] = [];
  for (const line of raw.split("\n")) {
    const p = line.split("\x1f");
    if (p.length < 3 || !p[2]) continue;
    // \x1e zurück in Zeilenumbrüche — substanz() muss Überschriftenzeilen
    // erkennen können. Ohne das ist der ganze Text EINE Zeile, die mit "#"
    // beginnt, und substanz() liefert einen leeren String.
    docs.push({ slug: p[0], xmlUrl: p[1], text: p.slice(2).join("\x1e").replace(/\x1e/g, "\n") });
  }

  console.log(`Quelle:     ${SOURCE}`);
  console.log(`Stichprobe: ${docs.length} Dokumente mit XML-Quelle`);
  console.log(`Schwelle:   ${(SCHWELLE * 100).toFixed(0)} % Fehlbetrag\n`);
  if (docs.length === 0) return;

  let geprueft = 0, unvollstaendig = 0, nichtErreichbar = 0, laenger = 0;
  const funde: { slug: string; unser: number; quelle: number; fehlt: number; beispiel: string }[] = [];

  for (const d of docs) {
    let xml: string;
    try {
      const res = await fetch(d.xmlUrl, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) { nichtErreichbar++; await sleep(RATE_MS); continue; }
      xml = await res.text();
    } catch { nichtErreichbar++; await sleep(RATE_MS); continue; }

    const quelle = substanz(ohneMetadaten(risXmlToText(xml)));
    const unser = substanz(d.text);
    geprueft++;

    // Satz-Enthaltensein statt Längenvergleich.
    //
    // Der Längenvergleich zwang dazu, jede strukturelle Abweichung exakt
    // nachzubilden: die Quelle führt Schlagworte, Aktualisierungsdatum,
    // Gesetzes- und Dokumentnummer im Text, wir im Frontmatter. Zwei von drei
    // von Hand geprüften "Funden" waren solche Fehlalarme — § 7 ÖSVO 2012
    // endete bei uns auf demselben Satz wie die Quelle und wurde trotzdem als
    // "72 % fehlend" gemeldet.
    //
    // Der Enthaltensein-Test fragt stattdessen: welche Sätze der Quelle
    // stehen NICHT in unserem Text? Das ist gegen Metadaten-Unterschiede
    // unempfindlich und misst genau das, was zählt — fehlenden Normtext.
    const saetze = quelle.split(/(?<=[.;:])\s+/).map((x) => x.trim())
      .filter((x) => x.length >= 40 && !/^(Schlagworte|Zuletzt aktualisiert|Gesetzesnummer|Dokumentnummer|alte Dokumentnummer|Index|Typ|Kundmachungsorgan)/i.test(x));
    const fehlende = saetze.filter((x) => !unser.includes(x.slice(0, Math.min(x.length, 60))));
    const anteilFehlend = saetze.length ? fehlende.length / saetze.length : 0;

    // Kopf-/Fußzeilen der Quelle fließen nicht in unseren Text ein; deshalb
    // zählt nur, wenn UNSER Text kürzer ist als die Quelle.
    if (saetze.length >= 3 && anteilFehlend >= SCHWELLE) {
      unvollstaendig++;
      funde.push({
        slug: d.slug, unser: fehlende.length, quelle: saetze.length,
        fehlt: anteilFehlend, beispiel: fehlende[0]?.slice(0, 80) ?? "",
      });
    }
    if (geprueft % 25 === 0) process.stderr.write(`\r  ${geprueft}/${docs.length}`);
    await sleep(RATE_MS);
  }
  process.stderr.write("\r");

  console.log("─".repeat(72));
  console.log(`geprüft:          ${geprueft}`);
  console.log(`unvollständig:    ${unvollstaendig}  (${((unvollstaendig / Math.max(geprueft, 1)) * 100).toFixed(1)} %)`);
  console.log(`länger als Quelle:${laenger}   XML nicht erreichbar: ${nichtErreichbar}`);

  if (funde.length) {
    console.log(`\nGrößte Fehlbeträge:`);
    funde.sort((a, b) => b.fehlt - a.fehlt);
    for (const f of funde.slice(0, 12)) {
      console.log(`  ${(f.fehlt * 100).toFixed(0).padStart(3)} %  ${String(f.unser).padStart(3)}/${String(f.quelle).padEnd(3)} Sätze fehlen  ${f.slug.slice(-44)}`);
      if (f.beispiel) console.log(`         fehlt z.B.: „${f.beispiel}…"`);
    }
    console.log(`\nDiese Dokumente sind strukturell einwandfrei und trotzdem unvollständig —`);
    console.log(`genau die Klasse, die keine Musterprüfung finden kann.`);
    process.exit(1);
  }
  console.log(`\nKein Dokument der Stichprobe ist gegenüber der Quelle unvollständig.`);
}

await main();
