#!/usr/bin/env bun
/**
 * RIS-Normen aus dem XML holen — normgenau, ohne PDF-Artefakte.
 *
 * Liest den Vollbestand aus ris-inforce-crawl.ts und holt zu jeder Norm das
 * RIS-XML (`.../NOR{id}/NOR{id}.xml`). Das XML trennt Metadaten, Gliederung und
 * Text sauber; Kopf-/Fußzeilen stehen in <kzinhalt>/<fzinhalt> und werden nicht
 * übernommen. Die Sprachausgabe-Duplikate ("Paragraph 197,") sind ein reines
 * HTML-Artefakt und im XML gar nicht vorhanden.
 *
 * Schreibt je Norm eine Markdown-Datei:
 *   law-corpus/at-normen/<abk-oder-gnr>/<p-1152|art-5|anl-2>.md
 *
 * Resumierbar: bereits vorhandene Dateien werden übersprungen.
 *
 *   bun run server/scripts/ris-xml-fetch-normen.ts --ris /tmp/ris-inforce.jsonl
 *   bun run server/scripts/ris-xml-fetch-normen.ts --ris … --limit 200      # Testlauf
 *   bun run server/scripts/ris-xml-fetch-normen.ts --ris … --gnr 10001622   # nur ABGB
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

function arg(name: string, fb?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fb;
}

const RIS_FILE = arg("ris", "/tmp/ris-inforce.jsonl")!;
const OUT_ROOT = arg("out", join(import.meta.dir, "..", "..", "law-corpus", "at-normen"))!;
const LIMIT = Number(arg("limit", "0"));
const ONLY_GNR = arg("gnr");
const ONLY_NAMED = process.argv.includes("--only-named");
/**
 * Vorhandene Dateien überschreiben statt überspringen.
 *
 * NÖTIG NACH JEDER KORREKTUR AM EXTRAKTOR. Der Lauf überspringt normalerweise
 * jede bereits vorhandene Datei (Zeile mit `existsSync(path)`) — das macht ihn
 * resümierbar, aber für eine Reparatur wirkungslos: nach dem `<listelem>`-Fix
 * hätte ein Vollauf über 243.477 Normen ausschließlich "skipped" gemeldet und
 * keine einzige Datei repariert.
 */
const FORCE = process.argv.includes("--force");
/**
 * Das abgerufene XML zusätzlich ablegen.
 *
 * Bisher wird es im Speicher ausgewertet und verworfen. Jede Korrektur am
 * Extraktor — wie die drei nachgetragenen Elemente `listelem`, `schluss` und
 * `schlussteil` — erzwingt dadurch einen vollständigen Neuabruf bei RIS über
 * Stunden. Mit abgelegtem XML ist dieselbe Korrektur eine lokale Sache von
 * Minuten. Kostet etwa 10 GB.
 */
const KEEP_XML = arg("keep-xml");
/** Quelle ist das lokal abgelegte Roh-XML statt RIS. Siehe Schleife unten. */
const FROM_XML = arg("from-xml");
/**
 * Voreinstellungen bewusst zurückhaltend: ein Lauf mit Nebenläufigkeit 10 und
 * ohne Pause hat den RIS-Dokumentserver (www.ris.bka.gv.at) nach ~6.000
 * Anfragen dazu gebracht, mit HTTP 503 zu antworten. Die OGD-API auf
 * data.bka.gv.at ist davon nicht betroffen — das ist ein anderer Host.
 * Etwa 6 Anfragen/Sekunde laufen stabil; der Vollbestand braucht damit ~7h.
 */
const CONCURRENCY = Number(arg("concurrency", "3"));
const REQUEST_TIMEOUT_MS = Number(arg("timeout-ms", "20000"));
const THROTTLE_MS = Number(arg("throttle-ms", "400"));
/** Nach so vielen aufeinanderfolgenden 503 wird der Lauf abgebrochen. */
const MAX_CONSECUTIVE_503 = Number(arg("max-503", "25"));
const UA = { "User-Agent": "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)" };
const NS = "{http://www.bka.gv.at}";

type Norm = {
  nor: string; gnr: string; kurztitel: string; abk: string | null;
  typ: string | null; apa: string | null; inkraft: string | null;
  ausserkraft: string | null; kundmachungsorgan: string | null;
  eli: string | null; url: string | null; indizes: string[];
};

/**
 * "§ 1152" → "p-1152", "Art. 5" → "art-5", "Anl. 2" → "anl-2"
 *
 * Zusammengesetzte Bezeichnungen werden VOLLSTÄNDIG abgebildet:
 * "Art. 4 § 1" → "art-4-p-1". Eine frühere Fassung schnitt nach der
 * Artikelnummer ab, wodurch Art. 4 § 1 bis § 4 alle auf "art-4" fielen und
 * einander überschrieben — 2.847 Normen gingen so verloren.
 *
 * § 0 (Inhaltsverzeichnis ohne Normtext) wird bewusst nicht abgebildet.
 */
function normKey(apa: string | null): string | null {
  if (!apa) return null;
  const s = apa.trim();
  if (/^§+\s*0\s*$/.test(s)) return null;

  const teile: string[] = [];
  const rx = /(§+|Art\.?|Anl\.?)\s*([0-9]+[a-zA-Z]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(s)) !== null) {
    const art = m[1].toLowerCase();
    const praefix = art.startsWith("§") ? "p" : art.startsWith("art") ? "art" : "anl";
    teile.push(`${praefix}-${m[2].toLowerCase()}`);
  }
  if (teile.length === 0) return null;
  return teile.join("-");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function esc(s: string): string {
  return s.replace(/"/g, '\\"');
}

/**
 * Extrahiert aus dem RIS-XML nur die Nutzdaten-Elemente mit ct="text".
 * <kzinhalt>/<fzinhalt> (Kopf-/Fußzeile) werden dadurch automatisch verworfen.
 */
function extractText(xml: string): { text: string; meta: Record<string, string> } {
  const meta: Record<string, string> = {};
  /**
   * Alle Teile je ct-Typ, nicht nur der erste.
   *
   * Vorher hielt `meta[ct]` den ERSTEN Block und verwarf jeden weiteren. Bei
   * einwertigen Angaben (kurztitel, gesnr, index) ist das richtig — die
   * kommen genau einmal vor. `beachte` und `anmerkung` sind aber regelmäßig
   * mehrabsätzig, und dort fiel alles ab Absatz 2 weg: bei NOR12034013
   * (Sorgerechtsübereinkommen) 12 von 24 Blöcken, darunter die Auslegung zu
   * lit. a bis d. An 4.000 XML-Dateien gemessen: 1,4 % der Dokumente,
   * hochgerechnet ~1.800 in at-normen, ~247.000 Zeichen.
   */
  const metaTeile: Record<string, string[]> = {};
  const blocks: string[] = [];

  // Bewusst regex statt DOM: das RIS-XML ist flach genug, und ein Parser über
  // 158k Dokumente kostet spürbar mehr Zeit.
  //
  // `table`/`liste` dürfen NICHT in der Alternation stehen: die Regex hätte den
  // gesamten Tabellenblock verschluckt, und da <table> kein ct-Attribut trägt,
  // fiel er durch beide Zweige und wurde verworfen — samt der darin
  // verschachtelten <absatz ct="text">. Normen, deren Inhalt vollständig in
  // Tabellen steht (Lehrpläne, Tarife, Anlagen), ergaben dadurch gar keinen
  // Text und wurden übersprungen. Ohne `table` greifen die inneren Elemente
  // direkt: bei NOR40226748 sind das 32 Blöcke / 5.545 Zeichen statt null.
  //
  // `listelem` und `schluss`/`schlussteil` MÜSSEN in der Alternation stehen:
  // Listenelemente (Aufzählungen) und Schluss-Texte tragen ct="text" und
  // enthalten echten Normtext. Ohne sie fiel § 20 PThG 2024 nach „dient der"
  // ab — die gesamte Aufzählung (4 Punkte) stand im <listelem>, der <schluss>
  // vervollständigte den Satz. <schlussteil> ist dasselbe wie <schluss> mit
  // anderer Tag-Struktur (</schlussteil> statt </schluss>).
  // Verifiziert an NOR40261791 (pthg-2024/p-20), NOR40174507, NOR40257948.
  const tagRe = /<(absatz|ueberschrift|listelem|schluss|schlussteil)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    const attrs = m[2];
    const inner = m[3];
    const ctM = attrs.match(/\bct="([^"]*)"/);
    const ct = ctM ? ctM[1] : null;
    const plain = inner
      .replace(/<[^>]+>/g, " ")
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain) continue;
    if (ct && ct !== "text") {
      (metaTeile[ct] ??= []).push(plain);
      continue;
    }
    if (ct === "text") blocks.push(plain);
  }
  // Mehrteilige Angaben zusammenführen. Einwertige Typen ergeben dabei
  // unverändert ihren einen Wert, mehrteilige den vollständigen Text.
  for (const [ct, teile] of Object.entries(metaTeile)) meta[ct] = teile.join(" ");
  return { text: blocks.join("\n\n"), meta };
}

/**
 * Ohne Timeout hängen Worker unbegrenzt an gedrosselten Verbindungen — RIS
 * lässt Sockets offen statt sie zu schließen. AbortSignal.timeout ist daher
 * nicht optional. Bei 429/503 wird zusätzlich länger zurückgehalten.
 */
/** Zählt aufeinanderfolgende Drosselungs-Antworten über alle Worker hinweg. */
let consecutive503 = 0;
let aborted = false;

async function fetchXml(nor: string, attempt = 0): Promise<string | null> {
  const url = `https://www.ris.bka.gv.at/Dokumente/Bundesnormen/${nor}/${nor}.xml`;
  try {
    const res = await fetch(url, {
      headers: UA,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 404) {
      consecutive503 = 0;
      return null;
    }
    if (res.status === 429 || res.status === 503) {
      consecutive503++;
      if (consecutive503 >= MAX_CONSECUTIVE_503) {
        aborted = true;
        return null;
      }
      if (attempt < 6) {
        await new Promise((r) => setTimeout(r, 3000 * 2 ** attempt));
        return fetchXml(nor, attempt + 1);
      }
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    consecutive503 = 0;
    return body;
  } catch {
    if (attempt < 5) {
      await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
      return fetchXml(nor, attempt + 1);
    }
    return null;
  }
}

function buildMarkdown(n: Norm, key: string, text: string, meta: Record<string, string>): string {
  // Titel IMMER aus der RIS-Bezeichnung, nie aus dem Dateischlüssel. Der
  // Schlüssel ist verlustbehaftet normalisiert: aus "Art. 1 § 1" wird
  // "art-1-p-1", und die frühere Rückübersetzung ergab "Art. 1-p-1".
  // Bei mehrfach belegter Bezeichnung (etwa "Art. 5" für Artikel 5 UND
  // Artikel V im AktG) das Inkrafttreten anhängen — sonst stünden mehrere
  // Treffer mit identischem Titel nebeneinander und wären für den Leser nicht
  // auseinanderzuhalten.
  const mehrdeutig = key.includes("-nor");
  const basis = n.abk ? `${(n.apa ?? "").trim()} ${n.abk}`.trim() : n.kurztitel;
  const titel = mehrdeutig && n.inkraft ? `${basis} (ab ${n.inkraft})` : basis;
  const fm: string[] = [
    `title: "${esc(titel)}"`,
    `type: law`,
    `jurisdiction: at`,
    `gesetzesnummer: "${n.gnr}"`,
    `nor_id: "${n.nor}"`,
    // Map nor_id to frontmatter.id so importFromContent's dedup logic
    // recognizes RIS norms as distinct pages even when two norms share
    // identical body text (21 content_hash collisions in the 48k corpus,
    // e.g. gnr-20011099/art-1 vs gnr-20009758/art-1). Without this,
    // skipContentDuplicates silently drops the second norm.
    `id: "ris-${n.nor}"`,
  ];
  if (n.abk) fm.push(`abbreviation: "${esc(n.abk)}"`);
  // v0.49.1 — Bevorzuge den XML-Kurztitel (meta.kurztitel) über den
  // Listen-Kurztitel (n.kurztitel). Der Listen-Kurztitel ist der
  // übergeordnete Gesetzesname ("Allgemeines Sozialversicherungsgesetz"),
  // der XML-Kurztitel ist spezifischer ("... ÜR" für Übergangsrecht).
  // Ohne diesen Fix würden Übergangsrecht-Normen den gleichen statute-Wert
  // wie das Hauptgesetz haben — die AI könnte sie nicht unterscheiden.
  const statuteName = meta.kurztitel || n.kurztitel;
  fm.push(`statute: "${esc(statuteName)}"`);
  if (n.apa) fm.push(`paragraph: "${esc(n.apa)}"`);
  // v0.49.2 — Bevorzuge XML-Werte über Listen-Werte für typ und kundmachungsorgan.
  // Die Liste (ris-inforce.jsonl) ist ein Index mit normalisierten Werten
  // (en-dash statt ASCII minus, etc.); das XML ist das eigentliche Dokument
  // mit den originalen Werten. Ohne diesen Fix würden Werte wie
  // "Vertrag – Multilateral" (Liste, en-dash) und
  // "Vertrag - Multilateral" (XML, ASCII minus) auseinanderdriften.
  // ACHTUNG: inkrafttretensdatum bleibt aus der Liste (n.inkraft) weil die
  // Liste schon YYYY-MM-DD formatiert hat, das XML aber DD.MM.YYYY (meta.ikra).
  const typVal = meta.typ || n.typ;
  if (typVal) fm.push(`typ: "${esc(typVal)}"`);
  const kundVal = meta.kundmachungsorgan || n.kundmachungsorgan;
  if (kundVal) fm.push(`kundmachungsorgan: "${esc(kundVal)}"`);
  if (n.inkraft) fm.push(`inkrafttretensdatum: "${esc(n.inkraft)}"`);
  if (n.ausserkraft) fm.push(`ausserkrafttretensdatum: "${esc(n.ausserkraft)}"`);
  if (n.eli) fm.push(`eli: "${esc(n.eli)}"`);
  if (n.indizes.length) fm.push(`indizes: "${esc(n.indizes.join("; "))}"`);
  if (meta.ueberschrift) fm.push(`ueberschrift: "${esc(meta.ueberschrift)}"`);
  // v0.49 — RIS liefert 4 weitere Metadaten-Felder die wir bisher ignorierten.
  // extractText sammelt sie über ct= in meta; buildMarkdown schreibt sie ins
  // Frontmatter. Der Importer mappt sie dann in DB-Spalten.
  //   schlagworte  → Schlagworte (z.B. "Gleichheitssatz")
  //   anmerkung   → Anmerkung (z.B. "vgl. Art. 7 Abs. 1 B-VG")
  //   geaendert   → Zuletzt aktualisiert am (z.B. "04.09.2025")
  //   adoknr      → Alte Dokumentnummer (z.B. "N11867120790")
  if (meta.schlagworte) fm.push(`schlagworte: "${esc(meta.schlagworte)}"`);
  if (meta.anmerkung) fm.push(`anmerkung: "${esc(meta.anmerkung)}"`);
  if (meta.geaendert) fm.push(`zuletzt_aktualisiert: "${esc(meta.geaendert)}"`);
  if (meta.adoknr) fm.push(`alte_dokumentnummer: "${esc(meta.adoknr)}"`);
  fm.push(`source_url: "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/${n.nor}/${n.nor}.xml"`);
  fm.push(`source_format: xml`);
  fm.push(`retrieved_at: "${new Date().toISOString().slice(0, 10)}"`);
  fm.push(
    `license: "Quelle: RIS OGD (data.bka.gv.at), Bundeskanzleramt Österreich — Open Government Data, Namensnennung."`
  );
  // Integritäts-Gate von batch-import-from-disk.ts: Dateien ohne content_hash
  // werden als Qualitätsfehler verworfen. Gleiches Verfahren wie
  // backfill-utils.ts:contentHash — SHA-256 über den getrimmten Text, 16 Zeichen.
  // `beachte` und `anmerkung` gehören zusätzlich in den Body, nicht nur ins
  // Frontmatter. Sie tragen Geltungs- und Übergangshinweise ("Bleibt solange
  // in Geltung, bis erstmals Verfahren gemäß §§ 36 und 37 TKG …") und die
  // Auslegung einzelner Litera — für die Frage, ob eine Norm im Fall
  // überhaupt anwendbar ist, oft entscheidender als der Normtext selbst.
  // Frontmatter landet in DB-Spalten und wird NICHT gechunkt; nur was im Body
  // steht, ist über die Suche auffindbar und zitierbar.
  let koerper = text;
  if (meta.beachte) koerper += `\n\n## Beachte\n\n${meta.beachte}`;
  if (meta.gbeachte) koerper += `\n\n## Beachte\n\n${meta.gbeachte}`;
  if (meta.anmerkung) koerper += `\n\n## Anmerkung\n\n${meta.anmerkung}`;

  fm.push(`content_hash: "${createHash("sha256").update(koerper.trim()).digest("hex").slice(0, 16)}"`);

  return `---\n${fm.join("\n")}\n---\n\n# ${titel}\n\n${koerper}\n`;
}

async function main() {
  console.log(`Lade Normliste aus ${RIS_FILE} …`);
  let norms = readFileSync(RIS_FILE, "utf-8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l) as Norm)
    .filter((n) => n.nor && n.gnr);
  // Die Kollisionstabelle MUSS aus dem vollen Bestand kommen. Würde sie erst
  // nach --gnr/--only-named/--limit gebaut, sähe ein gefilterter Lauf nur ein
  // Gesetz je Abkürzung und hielte sie fälschlich für eindeutig — der Slug
  // fiele dann wieder mit dem des anderen Gesetzes zusammen.
  const abkZuGnrs = new Map<string, Set<string>>();
  for (const n of norms) {
    if (!n.abk) continue;
    const s = slugify(n.abk);
    if (!abkZuGnrs.has(s)) abkZuGnrs.set(s, new Set());
    abkZuGnrs.get(s)!.add(n.gnr);
  }

  /**
   * Mehrfach belegte Normschlüssel INNERHALB eines Gesetzes.
   *
   * RIS normalisiert römische und arabische Zählung auf dieselbe
   * `ArtikelParagraphAnlage`: im AktG steht "Art. 5" sowohl für Artikel 5
   * (Inkrafttreten 2019) als auch für Artikel V (1983) — zwei verschiedene
   * Normen mit verschiedenem Text. Ohne Unterscheidung gewinnt die zuerst
   * geschriebene Datei und die zweite wird als "bereits vorhanden"
   * übersprungen; 789 Normen gingen so verloren.
   *
   * Auch hier aus dem VOLLEN Bestand, und für ALLE Beteiligten eines
   * mehrfachen Schlüssels wird die NOR-ID angehängt — nicht nur für die
   * späteren. Sonst hinge der Slug davon ab, welche Datei zuerst geschrieben
   * wurde, und wäre zwischen zwei Läufen nicht stabil.
   */
  const mehrfachSchluessel = new Set<string>();
  {
    const proGesetzKey = new Map<string, Set<string>>();
    for (const n of norms) {
      const k = normKey(n.apa);
      if (!k) continue;
      const id = `${n.gnr}|${k}`;
      if (!proGesetzKey.has(id)) proGesetzKey.set(id, new Set());
      proGesetzKey.get(id)!.add(n.nor);
    }
    for (const [id, nors] of proGesetzKey) if (nors.size > 1) mehrfachSchluessel.add(id);
  }

  if (ONLY_GNR) norms = norms.filter((n) => n.gnr === ONLY_GNR);

  // --only-named: nur Gesetze MIT Abkürzung. Das ist der zitierfähige Kern
  // (1.840 Gesetze / ~67k Normen); der Rest sind Abkommen, Akkreditierungen und
  // Einzelverordnungen (8.855 Gesetze / ~92k Normen). Bei begrenztem
  // Anfragebudget zuerst diese holen.
  if (ONLY_NAMED) {
    const named = new Set(norms.filter((n) => n.abk).map((n) => n.gnr));
    norms = norms.filter((n) => named.has(n.gnr));
  }

  // Nach Gesetz gruppieren, damit ein abgebrochener Lauf vollständige Gesetze
  // hinterlässt statt überall Bruchstücke.
  norms.sort((a, b) => (a.gnr === b.gnr ? 0 : a.gnr < b.gnr ? -1 : 1));

  if (LIMIT > 0) norms = norms.slice(0, LIMIT);
  console.log(`  ${norms.length} Normen zu verarbeiten`);

  if (!existsSync(OUT_ROOT)) mkdirSync(OUT_ROOT, { recursive: true });

  const dirFor = (n: Norm): string => {
    if (!n.abk) return `gnr-${n.gnr}`;
    const s = slugify(n.abk);
    return (abkZuGnrs.get(s)?.size ?? 0) > 1 ? `${s}-${n.gnr}` : s;
  };
  const kollidierend = [...abkZuGnrs.entries()].filter(([, v]) => v.size > 1);
  if (kollidierend.length > 0) {
    console.log(`  ${kollidierend.length} mehrfach belegte Abkürzungen → Verzeichnis mit Gesetzesnummer`);
  }

  let done = 0, written = 0, skipped = 0, failed = 0, empty = 0, excluded = 0;
  let next = 0;

  async function worker() {
    while (true) {
      if (aborted) return;
      const i = next++;
      if (i >= norms.length) return;
      const n = norms[i];
      const basisKey = normKey(n.apa);
      if (!basisKey) { done++; excluded++; continue; }
      // Mehrfach belegter Schlüssel → NOR-ID anhängen, damit beide Normen
      // erhalten bleiben (siehe mehrfachSchluessel oben).
      const key = mehrfachSchluessel.has(`${n.gnr}|${basisKey}`)
        ? `${basisKey}-${n.nor.toLowerCase()}`
        : basisKey;

      const dir = join(OUT_ROOT, dirFor(n));
      const path = join(dir, `${key}.md`);

      if (existsSync(path) && !FORCE) { done++; skipped++; continue; }

      // --from-xml: aus dem lokal abgelegten Roh-XML neu ableiten statt zu
      // holen. Genau wofür --keep-xml existiert — eine Extraktor-Korrektur
      // kostet damit Minuten statt eines Neuabrufs über Stunden. Fehlt das
      // XML lokal (Norm noch nicht abgerufen), wird sie hier übersprungen,
      // NICHT nachgeholt: der Lauf soll offline und ohne RIS-Last laufen.
      let xml: string | null;
      if (FROM_XML) {
        const p = join(FROM_XML, dirFor(n), `${n.nor}.xml`);
        if (!existsSync(p)) { done++; skipped++; continue; }
        xml = readFileSync(p, "utf8");
      } else {
        if (THROTTLE_MS > 0) await new Promise((r) => setTimeout(r, THROTTLE_MS));
        xml = await fetchXml(n.nor);
      }
      if (!xml) { done++; failed++; continue; }

      const { text, meta } = extractText(xml);
      if (!text.trim()) { done++; empty++; continue; }

      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      // XML ablegen, bevor der Text daraus gewonnen wird — dann ist die
      // nächste Extraktor-Korrektur ein lokaler Lauf statt eines Neuabrufs.
      if (KEEP_XML) {
        const xmlDir = join(KEEP_XML, dirFor(n));
        if (!existsSync(xmlDir)) mkdirSync(xmlDir, { recursive: true });
        writeFileSync(join(xmlDir, `${n.nor}.xml`), xml);
      }
      writeFileSync(path, buildMarkdown(n, key, text, meta));
      done++; written++;

      if (done % 200 === 0) {
        process.stderr.write(
          `\r  ${done}/${norms.length} · neu ${written} · übersprungen ${skipped} · ausgeschlossen ${excluded} · leer ${empty} · fehlgeschlagen ${failed}`
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stderr.write("\n");
  if (aborted) {
    console.error(
      `! ABGEBROCHEN: ${MAX_CONSECUTIVE_503} Drosselungs-Antworten in Folge vom RIS-Dokumentserver.\n` +
        `  Später erneut starten — bereits geholte Normen werden übersprungen.`
    );
  }

  // ── Vollständigkeitsprüfung (1:1) ──────────────────────────────────
  // Jede Norm aus der RIS-Liste muss in genau einer Kategorie landen.
  // Wenn die Summe nicht aufgeht, sind Normen stillschweigend verloren gegangen.
  const accountedFor = written + skipped + empty + failed + excluded;
  const complete = accountedFor === norms.length;
  console.log(`✓ ${written} neu · ${skipped} bereits vorhanden · ${excluded} ausgeschlossen (§ 0) · ${empty} ohne Text · ${failed} fehlgeschlagen`);
  console.log(`  Ziel: ${OUT_ROOT} (${readdirSync(OUT_ROOT).length} Gesetzesordner)`);
  console.log(
    `  Vollständigkeit: ${accountedFor}/${norms.length} ` +
      (complete ? "✓ 1:1" : `✗ ${norms.length - accountedFor} FEHLEN`)
  );
  if (!complete && !aborted) {
    console.error(`! FEHLER: ${norms.length - accountedFor} Normen nicht zugeordnet — das ist ein Bug.`);
    process.exit(1);
  }
  if (aborted) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
