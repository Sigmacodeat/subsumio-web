#!/usr/bin/env bun
/**
 * Abnahme der Korpus-Datenbank — die Schleuse vor den Embeddings.
 *
 * WARUM ALS SKRIPT: Embeddings sind der erste Schritt, der Geld kostet und
 * sich nicht folgenlos wiederholen lässt. Was davor geprüft wird, muss
 * reproduzierbar sein und darf nicht aus zusammengetippten Abfragen bestehen.
 *
 * Die Prüfungen sind nicht ausgedacht, sondern die Kennzahlen, an denen der
 * Vorgängerbestand tatsächlich gescheitert ist (132.838 Chunks ohne Rolle,
 * 23.737 mit Website-Navigation, 39,7 % unstrukturiert) plus die drei
 * Zitierfehler, die beim Aufbau der neuen Datenbank aufgefallen sind
 * (Pseudo-Fundstelle "unbekannt Norm", 508-Zeichen-Labels, GNR-Platzhalter).
 *
 *   bun server/scripts/verify-corpus-db.ts --db subsumio_law_v2
 */

import { $ } from "bun";

const args = process.argv.slice(2);
const arg = (n: string, d?: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DB = arg("--db", "subsumio_law_v2")!;

const base = (await $`grep -hoE 'postgres://[^"'"'"' ]+subsumio_law[^"'"'"' ]*' server/.env`.quiet())
  .stdout.toString().trim().split("\n")[0];
if (!base) { console.error("Keine DB-URL in server/.env gefunden."); process.exit(1); }
// Datenbanknamen generisch tauschen — nicht auf "subsumio_law" fest verdrahten.
// Sobald server/.env auf die neue Datenbank zeigt, träfe ein fester Name nicht
// mehr zu und das Skript prüfte still die falsche Datenbank.
const URL_ = base.replace(/\/[^/?]+(\?|$)/, `/${DB}$1`);

async function q(sql: string): Promise<string> {
  return (await $`psql ${URL_} -tAc ${sql}`.quiet()).stdout.toString().trim();
}

interface Check {
  name: string;
  sql: string;
  /** true = bestanden. Bekommt den Rohwert als String. */
  ok: (v: string) => boolean;
  /** Erklärt, warum ein Abweichen zulässig sein kann. */
  note?: string;
}

const CHECKS: Check[] = [
  // ── Herkunft ───────────────────────────────────────────────────────────
  {
    // Diese Prüfung fehlte und hat eine Regression über Tage verdeckt.
    // Für die Nachführung refetchter Dateien gab es einen zweiten Normalizer
    // mit eigenem, "minimalem" Frontmatter-Bauer. Er kannte weder die
    // Umwandlung von ISO-Zeitstempeln in reine Datumsangaben noch das
    // Verwerfen der erfundenen `GNR-…`-Abkürzungen. 32.147 Seiten liefen so
    // roh in die Datenbank; sichtbar wurde es erst über 13.400 falsche
    // Datumsformate und 5.305 GNR-Platzhalter — beides vorher auf null.
    //
    // `schema_version` ist der Stempel des kanonischen Normalizers. Fehlt er,
    // ist die Seite an ihm vorbeigelaufen, ganz gleich wie sauber sie wirkt.
    name: "Seiten ohne kanonisches Schema",
    sql: `select count(*) from pages where not (frontmatter ? 'schema_version')`,
    ok: (v) => v === "0",
    note: "Diese Seiten haben den Normalizer umgangen — alle daran hängenden Regeln fehlen.",
  },

  // ── Struktur ───────────────────────────────────────────────────────────
  {
    name: "Chunks ohne chunk_role",
    sql: `select count(*) from content_chunks c join pages p on p.id=c.page_id
          where c.chunk_role is null and p.source_id <> 'law-at-literatur'`,
    ok: (v) => v === "0",
    note: "Literatur ausgenommen: sie läuft korrekt durch den generischen Chunker.",
  },
  {
    name: "Chunks ohne document_type",
    sql: `select count(*) from content_chunks c join pages p on p.id=c.page_id
          where c.document_type is null and p.source_id <> 'law-at-literatur'`,
    ok: (v) => v === "0",
  },
  {
    name: "Pages ohne Chunks",
    sql: `select count(*) from pages p where not exists
          (select 1 from content_chunks c where c.page_id = p.id)`,
    ok: (v) => v === "0",
  },
  // ── Inhaltliche Verunreinigung ─────────────────────────────────────────
  {
    name: "Website-Navigation im Text",
    sql: `select count(*) from content_chunks
          where chunk_text like '%Accesskey%' or chunk_text like '%Seitenbereiche:%'`,
    ok: (v) => v === "0",
  },
  {
    name: "Screenreader-Dopplungen",
    sql: `select count(*) from content_chunks where chunk_text ~ 'römisch [IVXLC]'`,
    ok: (v) => v === "0",
  },
  {
    name: "RIS-Boilerplate",
    sql: `select count(*) from content_chunks where chunk_text like '%Quelle: [RIS-OGD]%'`,
    ok: (v) => v === "0",
  },
  {
    name: "Platzhalter statt Volltext",
    sql: `select count(*) from content_chunks where chunk_text like '%Volltext nicht abrufbar%'`,
    ok: (v) => v === "0",
  },
  {
    name: "leere Chunks",
    sql: `select count(*) from content_chunks where trim(chunk_text) = ''`,
    ok: (v) => v === "0",
  },
  // ── Chunk-Größen ───────────────────────────────────────────────────────
  {
    name: "Chunks über 12.000 Zeichen",
    sql: `select count(*) from content_chunks where length(chunk_text) > 12000`,
    ok: (v) => v === "0",
    note: "Über dieser Grenze sprengt ein Treffer jedes sinnvolle Kontextfenster.",
  },
  {
    name: "unstrukturierte 'full'-Chunks",
    sql: `select round(100.0*count(*) filter (where chunk_role='full')/count(*),1)
          from content_chunks`,
    ok: (v) => parseFloat(v) < 25,
    note: "Bei kurzen Paragraphen ist ein ganzer § als eine Einheit richtig; Altbestand lag bei 39,7 %.",
  },
  // ── Zitierfähigkeit ────────────────────────────────────────────────────
  {
    name: "Gesetze ohne Fundstelle",
    sql: `select count(*) from content_chunks where document_type='statute' and canonical_label is null`,
    ok: (v) => v === "0",
  },
  {
    name: "Pseudo-Fundstelle 'unbekannt'",
    sql: `select count(*) from content_chunks where canonical_label like 'unbekannt%'`,
    ok: (v) => v === "0",
  },
  {
    name: "GNR-Platzhalter als Abkürzung",
    sql: `select count(*) from content_chunks where statute_abbr ~ '^GNR-[0-9]+'`,
    ok: (v) => v === "0",
    note: "Vom Fetcher erfundene Kennung — sieht amtlich aus, bedeutet nichts.",
  },
  {
    // Getrennte Maßstäbe, weil "lang" bei den beiden Dokumentarten
    // Verschiedenes bedeutet. Bei einer Entscheidung heißt lang: das Feld
    // enthält die Liste aller anwendenden Geschäftszahlen statt einer
    // Fundstelle — ein Defekt. Bei einem Gesetz ist es der amtliche Name;
    // "Verordnung des Gemeinderates der Marktgemeinde Winklern vom
    // 17. Dezember 2021, Zahl: 8500-1/2021, mit der Wasserbezugsgebühren …"
    // ist 205 Zeichen lang und exakt richtig. Eine pauschale 200-Zeichen-Grenze
    // hätte 1.915 korrekte Gesetzeszitate als Fehler gemeldet.
    name: "Entscheidungszitat länger als 200 Zeichen",
    sql: `select count(*) from content_chunks
          where document_type='decision' and length(canonical_label) > 200`,
    ok: (v) => v === "0",
    note: "Eine Liste aller anwendenden Entscheidungen ist keine Fundstelle.",
  },
  {
    name: "Gesetzeszitat länger als 400 Zeichen",
    sql: `select count(*) from content_chunks
          where document_type='statute' and length(canonical_label) > 400`,
    ok: (v) => v === "0",
    note: "Amtliche Verordnungstitel dürfen lang sein — jenseits 400 Zeichen ist es aber keiner mehr.",
  },
  {
    name: "ECLI-Feld ohne gültige ECLI",
    sql: `select count(*) from content_chunks where ecli is not null and ecli !~ '^ECLI:'`,
    ok: (v) => v === "0",
  },
  // ── Metadaten-Pflichtfelder ────────────────────────────────────────────
  {
    name: "Entscheidungen ohne Gericht",
    sql: `select count(*) from content_chunks where document_type='decision' and court is null`,
    ok: (v) => v === "0",
  },
  {
    name: "Entscheidungen ohne Datum",
    sql: `select count(*) from content_chunks where document_type='decision' and decision_date is null`,
    ok: (v) => v === "0",
  },
  {
    name: "Datum im falschen Format",
    sql: `select count(*) from content_chunks
          where decision_date is not null and decision_date !~ '^\\d{4}-\\d{2}-\\d{2}$'`,
    ok: (v) => v === "0",
    note: "Genau ein Format — sonst sortiert und filtert jede Stichtagsabfrage falsch.",
  },
  // ── Dubletten ──────────────────────────────────────────────────────────
  {
    name: "doppelte Pages (content_hash)",
    sql: `select coalesce(sum(n-1),0) from
          (select count(*) n from pages where content_hash is not null
           group by content_hash having count(*)>1) t`,
    ok: (v) => v === "0",
  },
  {
    name: "doppelte Slugs je Quelle",
    sql: `select coalesce(sum(n-1),0) from
          (select count(*) n from pages group by source_id, slug having count(*)>1) t`,
    ok: (v) => v === "0",
  },
  {
    // Diese Prüfung fehlte und war die teuerste Lücke der Abnahme: sie war
    // auf (source_id, slug) gruppiert und meldete deshalb 0, während
    // quellenübergreifend 2.661 Slugs doppelt vergeben waren — unter
    // `gnr-10000476/art-1` lagen ein Bundes- und ein Landesgesetz. Eine
    // Fundstelle, die auf zwei Gesetze zeigt, sieht eindeutig aus und ist es
    // nicht; genau daran scheitert ein Zitat unbemerkt.
    name: "doppelte Slugs quellenübergreifend",
    sql: `select coalesce(sum(n-1),0) from
          (select count(*) n from pages group by slug having count(*)>1) t`,
    ok: (v) => v === "0",
  },
  {
    name: "PDF-Seitenmarker im Text",
    sql: `select count(*) from content_chunks
          where chunk_text like '%--- Page %' or chunk_text like '%Bundesrecht konsolidiert%'`,
    ok: (v) => parseInt(v, 10) < 50,
    note: "Reste der Druckfassung; einzelne Treffer können echte Zitate in Entscheidungen sein.",
  },
  {
    /**
     * Text bricht mitten im Satz ab.
     *
     * Die teuerste Defektklasse des Projekts: `extractText()` in den
     * XML-Fetchern matchte nur `<absatz>` und `<ueberschrift>` —
     * `<listelem>`, `<schluss>` und `<schlussteil>` fielen durch. Jede
     * Aufzählung in jedem so geholten Gesetz fehlte. In
     * `landesrecht/gnr-20000502/anl-1` endete der Text auf "…ergeben", die
     * XML-Quelle führt dahinter 13 Mindestsätze mit Beträgen.
     *
     * Kein Chunk war kaputt, keine Fundstelle falsch, kein Zeichen
     * verunreinigt — es fehlte nur Text. Genau deshalb gehört die Prüfung
     * hierher: strukturelle Sauberkeit sagt nichts über Vollständigkeit.
     *
     * Die drei Ausschlüsse sind an echten Fällen belegt und KEINE Abbrüche:
     * Querverweise am Satzende ("… vgl"), der übliche Entscheidungsschluss
     * ("Es war somit spruchgemäß zu entscheiden") und Verweisketten auf
     * Geschäftszahlen.
     */
    name: "Text bricht mitten im Satz ab",
    sql: `with t as (
            select p.id, p.source_id,
                   trim(string_agg(c.chunk_text, E'\\n' order by c.chunk_index)) txt
            from pages p join content_chunks c on c.page_id = p.id
            where p.deleted_at is null
            group by p.id, p.source_id)
          select count(*) from t
          where length(txt) > 200
            and txt ~ '(?:^|\\s)[a-zäöüß][a-zäöüß0-9-]*\\s*$'
            and txt !~ '[.!?;:«»")\\]]\\s*$'
            and txt !~ '(vgl|Vgl)\\s*$'
            and txt !~ 'spruchgemäß zu entscheiden\\s*$'
            and txt !~ '(?:^|\\s)(der|die|das|und|oder|im|in|zu|von|mit|auf|für|ist|bei|nach|vor|seit|ab|bis|als|wie|wenn|dass|daß|sowie|beziehungsweise)\\s*$'`,
    ok: (v) => parseInt(v, 10) < 100,
    note: "Meist der <listelem>-Bug: fehlende Aufzählungen. Nur per XML-Neuabruf zu beheben.",
  },
  {
    name: "Kopf-/Fußzeile der Druckfassung",
    sql: `select count(*) from content_chunks
          where chunk_text ~ 'www\\.ris\\.bka\\.gv\\.at\\s*Seite \\d+ von \\d+'
             or chunk_text ~ 'Seite \\d+ von \\d+\\s*www\\.ris\\.bka\\.gv\\.at'`,
    ok: (v) => v === "0",
    note: "Dort ist auch die Seitenreihenfolge unzuverlässig — nur per Neuabruf zu beheben.",
  },
];

async function main() {
  console.log("═".repeat(72));
  console.log(`ABNAHME  ${DB}`);
  console.log("═".repeat(72));

  const pages = await q("select count(*) from pages");
  const chunks = await q("select count(*) from content_chunks");
  const sources = await q("select count(distinct source_id) from pages");
  console.log(`Pages ${Number(pages).toLocaleString("de-AT")}   Chunks ${Number(chunks).toLocaleString("de-AT")}   Quellen ${sources}\n`);

  let failed = 0;
  for (const c of CHECKS) {
    let v: string;
    try { v = await q(c.sql); } catch (e) { v = "FEHLER"; }
    const pass = v !== "FEHLER" && c.ok(v);
    if (!pass) failed++;
    console.log(`${pass ? "✓" : "✗"}  ${c.name.padEnd(38)} ${v}`);
    if (!pass && c.note) console.log(`     ${c.note}`);
  }

  console.log("\n" + "─".repeat(72));
  const embeddings = await q("select count(embedding) from content_chunks");
  console.log(`Embeddings: ${Number(embeddings).toLocaleString("de-AT")}`);

  if (failed === 0) {
    console.log("\nAlle Prüfungen bestanden — der Korpus ist bereit für die Embeddings.");
  } else {
    console.log(`\n${failed} Prüfung(en) nicht bestanden — KEINE Embeddings erzeugen.`);
    process.exit(1);
  }
}

await main();
