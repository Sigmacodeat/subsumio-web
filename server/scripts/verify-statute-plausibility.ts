#!/usr/bin/env bun
/**
 * Inhaltliche Plausibilitätsprüfung der Gesetze — die Schleuse vor den Embeddings.
 *
 * WOZU: `verify-corpus-db.ts` prüft Struktur (Rolle, Typ, Fundstelle, Dubletten).
 * Es kann NICHT sehen, ob im Dokument "§ 1295 ABGB" auch tatsächlich § 1295 ABGB
 * steht, ob zwei Gesetze ineinandergelaufen sind oder ob der Text mitten im Satz
 * abbricht. Genau das prüft dieses Skript.
 *
 * ROLLE DES MODELLS: Es urteilt, es schreibt NICHT um. Rechtstext darf ein
 * Sprachmodell nie anfassen — dieser Korpus enthielt schon einmal erfundene
 * Gesetzestexte. Die Ausgabe ist ausschließlich ein Befund je Dokument; keine
 * Zeile des Bestands wird verändert.
 *
 * ZWEISTUFIG, damit das Modell nur sieht, was Regeln nicht entscheiden können:
 *   Stufe 1 — deterministisch: Abschneiden mitten im Satz, Kodierungsreste,
 *             Titel/Paragraph passen nicht zum Text, verdächtige Kürze.
 *   Stufe 2 — Modell: liest Titel, Fundstelle und Text und beantwortet drei
 *             Fragen (passt der Text zur Fundstelle, ist es zusammenhängendes
 *             Recht, steht Fremdes darin).
 *
 * Läuft in Stapeln und schreibt nach jedem Stapel — abbrechbar und fortsetzbar.
 *
 *   bun server/scripts/verify-statute-plausibility.ts --limit 100
 *   bun server/scripts/verify-statute-plausibility.ts --source law-at-normen --batch 50
 *   bun server/scripts/verify-statute-plausibility.ts --all --resume
 */

import { writeFileSync, appendFileSync, existsSync, readFileSync } from "fs";
import { $ } from "bun";

const args = process.argv.slice(2);
const arg = (n: string, d?: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SOURCE = arg("--source");
// Auch Entscheidungen prüfbar — sie sind 88 % des Bestands.
const DOCTYPE = arg("--doctype", "statute")!;
const BATCH = parseInt(arg("--batch", "50")!, 10);
const LIMIT = parseInt(arg("--limit", "100")!, 10);
const ALL = args.includes("--all");
const RESUME = args.includes("--resume");
const MODEL = arg("--model", "anthropic:claude-haiku-4-5-20251001")!;
const EICHUNG = args.includes("--eichung");
const OUT = arg("--out", `/tmp/plausibilitaet-${arg("--doctype","statute")}.jsonl`)!;

const base = (await $`grep -hoE 'postgres://[^"'"'"' ]+subsumio_law[^"'"'"' ]*' server/.env`.quiet())
  .stdout.toString().trim().split("\n")[0];
const DB = arg("--db", "subsumio_law_v2")!;
const URL_ = base.replace(/\/[^/?]+(\?|$)/, `/${DB}$1`);

// ---------------------------------------------------------------------------
// Stufe 1 — deterministische Vorprüfung
// ---------------------------------------------------------------------------
/**
 * Bricht der Text mitten im Satz ab?
 *
 * Entscheidend ist das LETZTE WORT, nicht das letzte Zeichen. Die erste
 * Fassung prüfte auf einen Kleinbuchstaben am Ende und meldete dadurch jede
 * Unterschrift als Abbruch: "Der Bürgermeister: LAbg. Karl Markut" endet auf
 * "t". Ein Eigenname beginnt aber groß, ein abgeschnittener Satz endet auf
 * einem kleingeschriebenen Wort — "…ist auch im Internet unter".
 *
 * v2: Zusätzlich ausgeschlossen: Texte, die auf [,;] enden, gefolgt von einer
 * Aufzählung (z.B. "1. ..., 2. ..., 3. ..."). Diese sind keine Abbrüche,
 * sondern Listenstrukturen. Ebenso ausgeschlossen: Funktionswörter, die
 * typischerweise am Satzende stehen können (wie "werden", "haben", "sind").
 */
const RE_ABRUPT = /(?:^|\s)([a-zäöüß][\wäöüß-]*|[,;])\s*$/;
/** Wörter, die legitimerweise am Satzende stehen können (Verben, etc.). */
const RE_COMPLETE_END = /(?:werden|haben|sind|wird|hat|kann|darf|soll|wollen|müssen|können|dürfen|mögen|lassen|gilt|gilt|steht|liegt|ergibt|folgt|resultiert|endet|beginnt|startet|erfolgt|unterliegt|verbleibt|verbleiben|besteht|bestehen|umfasst|umfassen|enthält|enthalten|betragen|beträgt|entsprechen|entspricht|einhält|einhalten|gelten|gilt|gälte|gälten)\s*$/;
/** Reste fehlerhafter Kodierung. */
const RE_MOJIBAKE = /Ã[¤¶¼]|â€|�/;
/** Sprachausgabe-Dopplung, die dem Chunker entgangen sein könnte. */
const RE_SPOKEN = /Paragraph \d+,|Absatz \d+,|Ziffer \d+,/;

interface Doc {
  slug: string; source_id: string; title: string;
  label: string | null; paragraph_ref: string | null; text: string;
}

interface Finding {
  slug: string; stufe: "regel" | "modell";
  befund: string; detail: string;
}

function stufe1(d: Doc): Finding[] {
  const f: Finding[] = [];
  const t = d.text.trim();
  if (RE_MOJIBAKE.test(t)) f.push({ slug: d.slug, stufe: "regel", befund: "kodierung", detail: "Mojibake oder Ersatzzeichen im Text" });
  if (RE_SPOKEN.test(t)) f.push({ slug: d.slug, stufe: "regel", befund: "sprachausgabe", detail: "ausgeschriebene Paragraphenangabe im Text" });
  if (RE_ABRUPT.test(t) && t.length > 200 && !RE_COMPLETE_END.test(t))
    f.push({ slug: d.slug, stufe: "regel", befund: "abgeschnitten", detail: `endet auf "${t.slice(-45)}"` });
  return f;
}

// ---------------------------------------------------------------------------
// Stufe 2 — Modell-Urteil
// ---------------------------------------------------------------------------
const SYSTEM = `Du prüfst österreichische Rechtstexte auf Plausibilität. Du korrigierst NICHTS und schreibst NICHTS um — du beurteilst nur.

Zu jedem Dokument bekommst du: Fundstelle, Titel und den Text.

Beurteile ausschließlich diese drei Fragen:
1. PASST — behandelt der Text das, was Fundstelle und Titel ankündigen?
2. ZUSAMMENHÄNGEND — ist es durchgehender Rechtstext, oder bricht er ab, wiederholt sich, oder sind mehrere Dokumente ineinandergelaufen?
3. FREMD — steht Nicht-Normatives darin (Navigationstext, Kopfzeilen, Seitenzahlen, HTML-Reste, Inhalt eines anderen Gesetzes)?

Sei zurückhaltend. Vieles ist legitim, auch wenn es ungewohnt aussagt:
- sehr kurze Paragraphen ("§ 33. Auf die Durchführung ist § 17a anzuwenden.")
- Aufhebungsvermerke, Übergangsbestimmungen, reine Verweise
- Anlagen, die nur eine Tabelle oder Liste enthalten
- altertümliche Schreibweise (ABGB von 1811: "Vertheilung", "Rechtens")
- ein Absatz, der ohne Paragraphennennung beginnt ("(2) …")

Bei Gerichtsentscheidungen zusätzlich legitim:
- geschwärzte Personendaten als "XXXX" oder Sternchen — das ist der RIS-Standard
- ein Rechtssatz ohne Sachverhalt; er steht bewusst für sich
- Verweise auf andere Entscheidungen ohne deren Inhalt
- Spruch und Begründung getrennt, auch wenn nur eines vorliegt

Melde NUR echte Auffälligkeiten.

Antworte als JSONL, eine Zeile je Dokument, ohne weiteren Text:
{"id":<nummer>,"ok":true}
oder
{"id":<nummer>,"ok":false,"befund":"passt_nicht|abbruch|vermischt|fremdinhalt","detail":"<ein knapper Satz>"}`;

async function stufe2(docs: Doc[], chat: any): Promise<Finding[]> {
  const nummeriert = docs.map((d, i) =>
    `[${i + 1}] Fundstelle: ${d.label ?? d.paragraph_ref ?? "—"}\nTitel: ${d.title}\nText: ${d.text.slice(0, 1800)}`
  ).join("\n\n---\n\n");

  const res = await chat({
    model: MODEL,
    system: SYSTEM,
    cacheSystem: true,
    maxTokens: 4000,
    messages: [{ role: "user", content: `${docs.length} Dokumente:\n\n${nummeriert}` }],
  });

  const out: Finding[] = [];
  for (const line of (res.text ?? "").split("\n")) {
    const s = line.trim();
    if (!s.startsWith("{")) continue;
    try {
      const j = JSON.parse(s);
      if (j.ok === false && j.id >= 1 && j.id <= docs.length) {
        out.push({ slug: docs[j.id - 1].slug, stufe: "modell", befund: j.befund ?? "unklar", detail: j.detail ?? "" });
      }
    } catch { /* unvollständige Zeile ignorieren */ }
  }
  return out;
}

/**
 * Eichlauf: prüft den Prüfer an Fällen, deren Antwort feststeht.
 *
 * Ohne diese Messung ist jede Auffälligkeitsquote wertlos. Der erste Lauf mit
 * DeepSeek meldete 39,3 % — nachgeprüft war der Großteil falsch (ZPO § 525 hat
 * vollen Normtext, wurde als "kein Inhalt" gemeldet). Ein Prüfer mit hoher
 * Fehlalarmquote verdeckt die echten Funde.
 */
async function eichlauf(chat: any) {
  const faelle = readFileSync("server/test/fixtures/plausibilitaet-eichung.jsonl", "utf8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l) as { slug: string; erwartet: string; warum: string });
  const inlist = faelle.map((f) => `'${f.slug}'`).join(",");
  const sql = `select p.slug, p.source_id, coalesce(p.title,''), coalesce(min(c.canonical_label),''),
      coalesce(min(c.paragraph_ref),''), string_agg(c.chunk_text, E'\n' order by c.chunk_index)
    from pages p join content_chunks c on c.page_id=p.id where p.slug in (${inlist})
    group by p.slug, p.source_id, p.title`;
  const raw = (await $`psql ${URL_} -tAF${"\x1f"} -c ${sql}`.quiet()).stdout.toString();
  const docs: Doc[] = [];
  for (const line of raw.split("\n")) {
    const q = line.split("\x1f");
    if (q.length < 6) continue;
    docs.push({ slug: q[0], source_id: q[1], title: q[2], label: q[3] || null, paragraph_ref: q[4] || null, text: q.slice(5).join("\x1f") });
  }
  const befunde = [...docs.flatMap(stufe1), ...(await stufe2(docs, chat))];
  const gemeldet = new Set(befunde.map((b) => b.slug));

  let rp = 0, fp = 0, rn = 0, fn = 0;
  console.log(`\nEICHUNG — ${docs.length} Fälle mit bekannter Antwort\n`);
  for (const f of faelle) {
    const d = docs.find((x) => x.slug === f.slug);
    if (!d) { console.log(`  ?  ${f.slug} — nicht in der Datenbank`); continue; }
    const meldet = gemeldet.has(f.slug);
    const soll = f.erwartet === "defekt";
    const ok = meldet === soll;
    if (soll && meldet) rp++; else if (!soll && meldet) fp++;
    else if (!soll && !meldet) rn++; else fn++;
    console.log(`  ${ok ? "✓" : "✗"}  erwartet=${f.erwartet.padEnd(6)} gemeldet=${meldet ? "defekt" : "ok    "}  ${f.slug.slice(-52)}`);
    if (!ok) console.log(`       ${f.warum.slice(0, 100)}`);
  }
  const praez = rp + fp > 0 ? (100 * rp) / (rp + fp) : 100;
  const treff = rp + fn > 0 ? (100 * rp) / (rp + fn) : 100;
  console.log(`\n  richtig positiv ${rp}   falsch positiv ${fp}   richtig negativ ${rn}   falsch negativ ${fn}`);
  console.log(`  Genauigkeit ${praez.toFixed(0)} %   Trefferquote ${treff.toFixed(0)} %`);
  if (fp > 0) console.log(`\n  ${fp} Fehlalarm(e) — diesem Prüfer noch nicht vertrauen.`);
  else if (fn > 0) console.log(`\n  ${fn} übersehene(r) Defekt(e) — Prüfauftrag schärfen.`);
  else console.log(`\n  Eichung bestanden.`);
}

// ---------------------------------------------------------------------------
async function main() {
  const geprueft = new Set<string>();
  if (RESUME && existsSync(OUT)) {
    for (const l of readFileSync(OUT, "utf8").split("\n")) {
      try { const j = JSON.parse(l); if (j.slug) geprueft.add(j.slug); } catch { /* */ }
    }
    console.log(`[resume] ${geprueft.size} Dokumente bereits geprüft`);
  }

  // SQL-Injection-Schutz: SOURCE und DOCTYPE gegen Whitelist validieren.
  // Da psql -c keine Parameterbindung unterstützt, ist eine Whitelist die
  // sicherste Lösung. Beide Werte stammen aus CLI-Argumenten.
  const VALID_SOURCES = new Set([
    "law-at-normen", "law-at-landesrecht", "law-at-gemeinden", "law-at-bezirke",
    "law-at-bmerl", "law-at-avn", "law-at-avsv", "law-at-kmger", "law-at-spg",
    "law-at-staatsvertraege", "law-at-judikatur-vwgh", "law-at-judikatur-ogh",
    "law-at-judikatur-bvwg", "law-at-judikatur-lvwg", "law-at-judikatur-asylgh",
    "law-at-judikatur-vfgh", "law-at-judikatur-uvs", "law-at-judikatur-dsk",
    "law-at-judikatur-ubas", "law-at-judikatur-umse", "law-at-judikatur-gbk",
    "law-at-judikatur-pvak", "law-eu", "law-de", "law-ch",
  ]);
  const VALID_DOCTYPES = new Set(["statute", "decision", "literature"]);
  if (SOURCE && !VALID_SOURCES.has(SOURCE)) {
    console.error(`Ungültige --source: ${SOURCE}\nErlaubt: ${[...VALID_SOURCES].join(", ")}`);
    process.exit(1);
  }
  if (!VALID_DOCTYPES.has(DOCTYPE)) {
    console.error(`Ungültige --doctype: ${DOCTYPE}\nErlaubt: ${[...VALID_DOCTYPES].join(", ")}`);
    process.exit(1);
  }

  // WICHTIG: left(..., 6000) wurde entfernt — es hat den Text abgeschnitten und
  // dadurch false positives im RE_ABRUPT-Check ausgelöst (z.B. pthg-2024/p-20,
  // dessen Text nach 6000 Zeichen mitten im Satz endete). Der Modell-Prompt
  // kürzt selbst auf 1800 Zeichen (stufe2), aber die deterministische Prüfung
  // muss den VOLLSTÄNDIGEN Text sehen.
  const where = SOURCE ? `and p.source_id = '${SOURCE}'` : "";
  const cap = ALL ? "" : `limit ${LIMIT}`;
  // Ein Dokument = eine Seite; geprüft wird der zusammengesetzte Text ihrer Chunks.
  const sql = `
    select p.slug, p.source_id, coalesce(p.title,'') as title,
           coalesce(min(c.canonical_label),'') as label,
           coalesce(min(c.paragraph_ref),'') as paragraph_ref,
           string_agg(c.chunk_text, E'\n' order by c.chunk_index) as text
    from pages p join content_chunks c on c.page_id = p.id
    where c.document_type = '${DOCTYPE}' and p.deleted_at is null ${where}
    group by p.slug, p.source_id, p.title
    order by md5(p.slug)
    ${cap}`;

  const raw = (await $`psql ${URL_} -tAF${"\x1f"} -c ${sql}`.quiet()).stdout.toString();
  const docs: Doc[] = [];
  for (const line of raw.split("\n")) {
    const p = line.split("\x1f");
    if (p.length < 6) continue;
    const d: Doc = { slug: p[0], source_id: p[1], title: p[2], label: p[3] || null, paragraph_ref: p[4] || null, text: p.slice(5).join("\x1f") };
    if (!geprueft.has(d.slug)) docs.push(d);
  }

  console.log(`Modell:    ${MODEL}`);
  console.log(`Dokumente: ${docs.length}   Stapel: ${BATCH}\n`);
  if (docs.length === 0) return;

  const { loadConfig } = await import("../src/core/config.ts");
  const { buildGatewayConfig } = await import("../src/core/ai/build-gateway-config.ts");
  const { configureGateway, chat } = await import("../src/core/ai/gateway.ts");
  const cfg = loadConfig();
  if (!cfg) throw new Error("Keine Gateway-Konfiguration.");
  configureGateway(buildGatewayConfig(cfg));

  if (EICHUNG) { await eichlauf(chat); return; }

  let n = 0, auffaellig = 0, fehlerhafteStapel = 0;
  const zaehler: Record<string, number> = {};

  for (let i = 0; i < docs.length; i += BATCH) {
    const slice = docs.slice(i, i + BATCH);
    const befunde: Finding[] = [];
    for (const d of slice) befunde.push(...stufe1(d));
    let modellOk = true;
    try {
      befunde.push(...(await stufe2(slice, chat)));
    } catch (e) {
      // Ein gescheiterter Modellaufruf ist KEIN bestandener Prüflauf. Ohne
      // diese Unterscheidung meldete der erste Testlauf "50 Dokumente,
      // 0 auffällig, 100 % unauffällig" — obwohl das Modell gar nicht
      // geantwortet hatte. Ein falscher Grünbefund ist schlimmer als ein Fehler.
      modellOk = false;
      fehlerhafteStapel++;
      console.error(`  Stapel ${i / BATCH + 1}: MODELL NICHT ERREICHT — ${(e as Error).message.slice(0, 90)}`);
    }

    // Nur als geprüft vermerken, was auch wirklich geprüft wurde — sonst
    // überspringt --resume beim nächsten Lauf ungeprüfte Dokumente.
    if (modellOk) {
      for (const d of slice) appendFileSync(OUT, JSON.stringify({ slug: d.slug, geprueft: true }) + "\n");
    }
    for (const b of befunde) {
      appendFileSync(OUT, JSON.stringify(b) + "\n");
      zaehler[b.befund] = (zaehler[b.befund] ?? 0) + 1;
    }
    // Das Modell meldet gelegentlich dieselbe Nummer mehrfach — ein Stapel
    // wies 41 Befunde bei 40 Dokumenten aus und die Anzeige wurde negativ.
    // Je Dokument und Befundart zählt genau ein Eintrag.
    const gesehen = new Set<string>();
    const eindeutig = befunde.filter((b) => {
      const k = `${b.slug}::${b.befund}`;
      if (gesehen.has(k)) return false;
      gesehen.add(k);
      return true;
    });
    befunde.length = 0;
    befunde.push(...eindeutig);

    if (modellOk) {
      n += slice.length;
      auffaellig += befunde.length;
      const betroffen = new Set(befunde.map((b) => b.slug)).size;
      const pct = ((1 - betroffen / slice.length) * 100).toFixed(0);
      console.log(`  Stapel ${String(i / BATCH + 1).padStart(3)}  ${slice.length} Dokumente  ${befunde.length} auffällig  (${pct}% unauffällig)`);
    }
    for (const b of befunde.slice(0, 3)) console.log(`      ${b.befund.padEnd(14)} ${b.slug.slice(-40)}  ${b.detail.slice(0, 70)}`);
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log(`geprüft: ${n}   auffällig: ${auffaellig}  (${((auffaellig / Math.max(n, 1)) * 100).toFixed(1)} %)`);
  for (const [k, v] of Object.entries(zaehler).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(6)}  ${k}`);
  console.log(`\nBefunde: ${OUT}`);
  if (fehlerhafteStapel > 0) {
    console.error(`\n${fehlerhafteStapel} Stapel konnten NICHT geprüft werden — Ergebnis unvollständig.`);
    process.exit(1);
  }
}

await main();
