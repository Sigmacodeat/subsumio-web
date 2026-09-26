#!/usr/bin/env bun
/**
 * PDF-Korpora aus RIS-OGD erschließen: Bezirke (Bvb) und KmGer.
 *
 * WARUM EIGENES SKRIPT: Für diese beiden Korpora liefert RIS ausschließlich
 * `Authentisch` = PDF. Es gibt kein XML und kein HTML — geprüft über die
 * OGD-API und mit einem Testrequest bestätigt (der geratene XML-Pfad
 * antwortet mit HTTP 404). Der bestehende XML-Refetch läuft hier
 * zwangsläufig ins Leere.
 *
 * Bisher enthielten diese Dateien die abgeschabte RIS-Weboberfläche
 * ("Zum Inhalt (Accesskey 0)") statt Verordnungstext — alle 2.484 Bezirke-
 * und 70 KmGer-Dateien.
 *
 * DETERMINISTISCH: Die PDFs tragen eine Textschicht (325 bzw. 3.335
 * Text-Operatoren in der Stichprobe), es wird also `pdftotext -layout`
 * verwendet — kein OCR, kein LLM. Rechtstext darf nicht durch ein
 * Wahrscheinlichkeitsmodell laufen.
 *
 * INHALT (Stichprobe): Bezirke = Verordnungen der Bezirkshauptmannschaften
 * mit §/Absatz-Gliederung (z.B. Apotheken-Kernöffnungszeiten nach § 8
 * ApothekenG). KmGer = Geschäftsverteilungen der Landesverwaltungsgerichte,
 * aus denen sich die Zuständigkeit von Richter und Senat ergibt.
 *
 *   bun server/scripts/fetch-ris-pdf-corpus.ts --corpus Bezirke --dry-run
 *   bun server/scripts/fetch-ris-pdf-corpus.ts --corpus Bezirke
 *   bun server/scripts/fetch-ris-pdf-corpus.ts --corpus KmGer
 *   bun server/scripts/fetch-ris-pdf-corpus.ts --corpus Bezirke --ids /law-corpus/_state/rejected-law-at-bezirke-generation-known_bad.txt [--dry-run] [--ids-since 2026-09-26]
 *
 * --ids: holt nur die gelisteten Dokumentnummern (eine je Zeile, z.B. aus
 * list-rejected-pages.ts) neu. RIS kennt für diese Korpora keinen
 * Einzelabruf mit Metadaten, deshalb werden die Listenseiten geblättert
 * (Bezirke ≈ 27, KmGer 1 Anfrage) und nur die PDFs der gelisteten Nummern
 * geladen. Jede Rohdatei, die die Nummer bereits trägt, wird an ihrem Pfad
 * überschrieben (corpus-id-index.ts) — eine Kopie daneben würde der
 * Normalizer nicht zwingend bevorzugen. Nummern, die RIS nicht mehr listet,
 * landen als not_found in _state/ris-fetch-outcomes.jsonl. Fortsetzbar über
 * retrieved_at >= --ids-since (Standard: heute). --dry-run zählt nur, ohne
 * RIS-Anfrage.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync, unlinkSync, renameSync } from "fs";
import { dirname, join } from "path";
import { createHash } from "crypto";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { risMassPause, RIS_PAUSE_MS } from "./ris-pace";
import { contentHash } from "./backfill-utils";
import {
  alreadyRefetched,
  indexRawFilesById,
  readIdList,
  retrievedAtOfRawText,
} from "./corpus-id-index";
import { recordFetchOutcome } from "./ris-fetch-outcomes";

const args = process.argv.slice(2);
const arg = (n: string, d?: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const CORPUS = arg("--corpus", "Bezirke")!;
const DRY = args.includes("--dry-run");
const LIMIT = parseInt(arg("--limit", "0")!, 10);
const NO_LOCK = args.includes("--no-lock");
const IDS_FILE = arg("--ids");
const IDS_SINCE = arg("--ids-since", new Date().toISOString().slice(0, 10))!;

const UA = "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)";
const API = "https://data.bka.gv.at/ris/api/v2.6";
const CORPUS_ROOT =
  process.env.LAW_CORPUS_ROOT ?? join(import.meta.dirname, "..", "..", "law-corpus");

/** Endpunkt-Konfiguration: Bezirke ist ein eigener Endpunkt ohne Applikation. */
/**
 * `container` ist die Ebene mit Titel/Kurztitel/Bundesland, `detail` der
 * korpusspezifische Block darin. RIS verschachtelt das so:
 *   Bezirke → Metadaten.Bezirke.{Titel,Kurztitel,Bundesland}, darin .Bvb.{…}
 *   KmGer   → Metadaten.Sonstige.{Titel,Kundmachungsdatum}, darin .KmGer.{…}
 */
const CONFIG: Record<
  string,
  { endpoint: string; applikation?: string; dir: string; container: string; detail: string }
> = {
  Bezirke: { endpoint: "Bezirke", dir: "at-bezirke", container: "Bezirke", detail: "Bvb" },
  KmGer: {
    endpoint: "Sonstige",
    applikation: "KmGer",
    dir: "at-kmger",
    container: "Sonstige",
    detail: "KmGer",
  },
};

const cfg = CONFIG[CORPUS];
if (!cfg) {
  console.error(`--corpus muss Bezirke oder KmGer sein`);
  process.exit(1);
}

const one = <T>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);
const all = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** `{ item: "x" }` oder `{ item: ["x","y"] }` — RIS liefert beides. */
function items(v: any): string[] {
  if (v == null) return [];
  const inner = v.item ?? v;
  return all<any>(inner)
    .map((x) => String(x).trim())
    .filter(Boolean);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function yamlStr(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** PDF → Text über die eingebettete Textschicht. Kein OCR. */
async function pdfToText(buf: ArrayBuffer): Promise<string> {
  const tmp = join(
    process.env.TMPDIR ?? "/tmp",
    `ris-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`
  );
  writeFileSync(tmp, Buffer.from(buf));
  try {
    const proc = Bun.spawn(["pdftotext", "-layout", "-enc", "UTF-8", tmp, "-"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return out;
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* egal */
    }
  }
}

/**
 * Amtssignatur-Kopfzeilen und Seitenumbruch-Artefakte entfernen.
 * Reine Rahmenzeilen — kein Normtext. Alles andere bleibt unangetastet.
 */
function cleanPdfText(raw: string): string {
  return raw
    .split("\n")
    .filter((l) => !/^\s*Amtssigniert\.\s*SID\d+/.test(l))
    .filter((l) => !/^\s*Informationen unter:\s*\S+$/.test(l))
    .filter((l) => !/^\s*(www\.)?[a-z.-]+\.gv\.at\/amtssignatur\s*$/i.test(l))
    .join("\n")
    .replace(/\f/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

interface Doc {
  id: string;
  title: string;
  pdfUrl: string;
  kundmachungsdatum: string | null;
  typ: string | null;
  behoerde: string | null;
  bundesland: string | null;
  kundmachungsorgan: string | null;
  inkrafttreten: string | null;
}

/** Eine API-Seite holen und zu Doc-Sätzen normalisieren. */
async function fetchPage(page: number): Promise<{ docs: Doc[]; total: number }> {
  const u = new URL(`${API}/${cfg.endpoint}`);
  u.searchParams.set("DokumenteProSeite", "OneHundred");
  u.searchParams.set("Seitennummer", String(page));
  if (cfg.applikation) u.searchParams.set("Applikation", cfg.applikation);

  const res = await fetch(u, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`API HTTP ${res.status} (Seite ${page})`);
  const json: any = await res.json();
  const results = json?.OgdSearchResult?.OgdDocumentResults;
  const total = parseInt(results?.Hits?.["#text"] ?? "0", 10);

  const docs: Doc[] = [];
  for (const ref of all<any>(results?.OgdDocumentReference)) {
    const md = ref?.Data?.Metadaten ?? {};
    const cont = md[cfg.container] ?? {};
    const spec = cont[cfg.detail] ?? {};
    const tech = md.Technisch ?? {};

    const cr = one<any>(ref?.Data?.Dokumentliste?.ContentReference);
    const urls = all<any>(cr?.Urls?.ContentUrl);
    const pdf = urls.find((x) => /pdf$/i.test(x?.Url ?? ""))?.Url;
    if (!pdf) continue;

    // Titel tragen CRLF und Doppel-Leerzeichen aus dem RIS-Redaktionssystem.
    const norm = (v: unknown) =>
      v == null
        ? null
        : String(v)
            .replace(/<br\s*\/?>/gi, " ")
            .replace(/\s+/g, " ")
            .trim() || null;

    const id = String(tech.ID ?? pdf.split("/").slice(-2)[0]);
    const title = norm(cont.Titel) ?? norm(cont.Kurztitel) ?? norm(spec.Kurzinformation) ?? id;

    docs.push({
      id,
      title,
      pdfUrl: pdf,
      kundmachungsdatum: spec.Kundmachungsdatum ?? cont.Kundmachungsdatum ?? null,
      typ: norm(spec.Typ),
      behoerde: norm(spec.Bezirksverwaltungsbehoerde ?? spec.Gericht ?? tech.Organ),
      bundesland: norm(cont.Bundesland),
      kundmachungsorgan: norm(
        [spec.Kundmachungsorgan, spec.Kundmachungsnummer].filter(Boolean).join(" ")
      ),
      inkrafttreten: spec.Inkrafttretensdatum ?? null,
    });
  }
  return { docs, total };
}

function toMarkdown(d: Doc, body: string): string {
  const fm = [
    "---",
    `title: ${yamlStr(d.title)}`,
    `type: "law"`,
    `jurisdiction: at`,
    `document_id: ${yamlStr(d.id)}`,
    d.typ ? `typ_detail: ${yamlStr(d.typ)}` : null,
    d.behoerde ? `organ: ${yamlStr(d.behoerde)}` : null,
    d.bundesland ? `bundesland: ${yamlStr(d.bundesland)}` : null,
    d.kundmachungsorgan ? `kundmachungsorgan: ${yamlStr(d.kundmachungsorgan)}` : null,
    d.kundmachungsdatum ? `kundmachungsdatum: ${yamlStr(d.kundmachungsdatum)}` : null,
    d.inkrafttreten ? `inkrafttretensdatum: ${yamlStr(d.inkrafttreten)}` : null,
    `source: ris-ogd`,
    `source_url: ${yamlStr(d.pdfUrl)}`,
    `source_format: pdf`,
    `retrieved_at: ${yamlStr(new Date().toISOString().slice(0, 10))}`,
    `license: "Quelle: RIS OGD (data.bka.gv.at), Bundeskanzleramt Österreich — Open Government Data, Namensnennung."`,
    `content_hash: ${yamlStr(contentHash(body))}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");
  return `${fm}\n\n# ${d.title}\n\n${body}\n`;
}

type DocText =
  | { ok: true; text: string }
  | { ok: false; reason: "http"; status: number }
  | { ok: false; reason: "empty"; length: number };

/** PDF eines Dokuments laden und zu Text machen (ohne Pause — die setzt der Aufrufer). */
async function fetchDocText(d: Doc): Promise<DocText> {
  const res = await fetch(d.pdfUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) return { ok: false, reason: "http", status: res.status };
  const text = cleanPdfText(await pdfToText(await res.arrayBuffer()));
  // Ohne Textschicht kein Volltext — lieber gar nichts schreiben als
  // eine Datei, die Inhalt vortäuscht.
  if (text.length < 120) return { ok: false, reason: "empty", length: text.length };
  return { ok: true, text };
}

function defaultFileFor(outDir: string, d: Doc): string {
  return join(outDir, `${slugify(d.title || d.id)}-${slugify(d.id).slice(-24)}.md`);
}

function atomicWriteFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(
    dirname(path),
    `.refetch-${process.pid}-${Math.random().toString(36).slice(2, 8)}.tmp`
  );
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

/** --ids: nur die gelisteten Dokumentnummern neu holen (siehe Dateikopf). */
async function refetchIds(outDir: string, idsFile: string): Promise<void> {
  const ids = readIdList(idsFile);
  console.log(`Id-Liste:  ${ids.length} Dokumentnummern aus ${idsFile}`);
  const index = indexRawFilesById(outDir, new Set(ids));
  const pending = new Set(
    ids.filter(
      (id) =>
        !alreadyRefetched(
          (index.get(id) ?? []).map((p) => retrievedAtOfRawText(readFileSync(p, "utf8"))),
          IDS_SINCE
        )
    )
  );
  console.log(
    `           ${index.size} mit Rohdatei, ${ids.length - pending.size} schon seit ${IDS_SINCE} geholt, ${pending.size} offen`
  );
  if (DRY) {
    console.log(
      `[DRY-RUN] ein echter Lauf stellt ${pending.size} PDF-Anfragen + die Listenseiten (je 100 Dokumente) — keine Anfrage gestellt.`
    );
    return;
  }
  if (pending.size === 0) return;

  let written = 0,
    newFiles = 0,
    failed = 0,
    emptyText = 0,
    page = 1;
  const found = new Set<string>();
  const corpusName = cfg.dir;
  for (;;) {
    const { docs } = await fetchPage(page);
    await risMassPause("PDF-Corpus (Id-Liste)");
    if (docs.length === 0) break;
    for (const d of docs) {
      if (!pending.has(d.id) || found.has(d.id)) continue;
      found.add(d.id);
      try {
        const r = await fetchDocText(d);
        if (!r.ok) {
          if (r.reason === "http") {
            failed++;
            console.log(`  ✗ HTTP ${r.status}  ${d.id}`);
            recordFetchOutcome(
              CORPUS_ROOT,
              corpusName,
              d.id,
              r.status === 404 ? "not_found" : "failed",
              `HTTP ${r.status}`
            );
          } else {
            emptyText++;
            console.log(`  ⊘ kein Text (${r.length} Zeichen)  ${d.id}`);
            recordFetchOutcome(CORPUS_ROOT, corpusName, d.id, "no_text", "PDF ohne Textschicht");
          }
        } else {
          const existing = index.get(d.id) ?? [];
          const targets = existing.length > 0 ? existing : [defaultFileFor(outDir, d)];
          if (existing.length === 0) newFiles++;
          const md = toMarkdown(d, r.text);
          for (const t of targets) atomicWriteFile(t, md);
          written++;
          if (written % 50 === 0) console.log(`  ✓ ${String(written).padStart(5)}/${pending.size}`);
        }
      } catch (e) {
        failed++;
        console.log(`  ✗ ${d.id}: ${(e as Error).message.slice(0, 80)}`);
        recordFetchOutcome(CORPUS_ROOT, corpusName, d.id, "failed", (e as Error).message);
      }
      await risMassPause("PDF-Corpus (Id-Liste)");
    }
    if (found.size >= pending.size) break;
    page++;
  }

  const missing = [...pending].filter((id) => !found.has(id));
  for (const id of missing) {
    recordFetchOutcome(CORPUS_ROOT, corpusName, id, "not_found", "nicht mehr in der RIS-Liste");
  }
  console.log(
    `\nId-Liste: geschrieben ${written} (neue Dateien ${newFiles})   ohne Textschicht: ${emptyText}   Fehler: ${failed}   von RIS nicht mehr gelistet: ${missing.length}`
  );
}

async function main() {
  const outDir = join(CORPUS_ROOT, cfg.dir);
  console.log(
    `Korpus:    ${CORPUS} (${cfg.endpoint}${cfg.applikation ? "/" + cfg.applikation : ""})`
  );
  console.log(`Ziel:      ${outDir}`);
  console.log(`Rate:      ${RIS_PAUSE_MS}ms + Fenster-Gate   ${DRY ? "[DRY-RUN]" : ""}`);

  if (!NO_LOCK && !DRY) {
    console.log("Warte auf RIS-Lock (RIS-OGD erlaubt nur eine aktive Verbindung)…");
    await acquireRisLock();
    console.log("RIS-Lock erhalten.");
  }

  if (IDS_FILE) {
    try {
      await refetchIds(outDir, IDS_FILE);
    } finally {
      if (!NO_LOCK && !DRY) releaseRisLock();
    }
    return;
  }

  let written = 0,
    failed = 0,
    emptyText = 0,
    page = 1,
    total = 0;
  try {
    for (;;) {
      const { docs, total: t } = await fetchPage(page);
      if (page === 1) {
        total = t;
        console.log(`RIS meldet ${total} Dokumente.\n`);
      }
      if (docs.length === 0) break;

      for (const d of docs) {
        if (LIMIT && written >= LIMIT) {
          console.log("\nLimit erreicht.");
          return;
        }
        try {
          const r = await fetchDocText(d);
          if (!r.ok) {
            if (r.reason === "http") {
              failed++;
              console.log(`  ✗ HTTP ${r.status}  ${d.id}`);
            } else {
              emptyText++;
              console.log(`  ⊘ kein Text (${r.length} Zeichen)  ${d.id}`);
            }
            await risMassPause("PDF-Corpus");
            continue;
          }
          const text = r.text;

          const file = defaultFileFor(outDir, d);
          if (!DRY) {
            mkdirSync(outDir, { recursive: true });
            writeFileSync(file, toMarkdown(d, text), "utf8");
          }
          written++;
          if (written % 50 === 0 || DRY) {
            console.log(`  ✓ ${String(written).padStart(5)}/${total}  ${d.title.slice(0, 62)}`);
          }
        } catch (e) {
          failed++;
          console.log(`  ✗ ${d.id}: ${(e as Error).message.slice(0, 80)}`);
        }
        await risMassPause("PDF-Corpus");
      }
      if (DRY) break;
      page++;
    }
  } finally {
    if (!NO_LOCK && !DRY) releaseRisLock();
  }

  console.log(`\nGeschrieben: ${written}   ohne Textschicht: ${emptyText}   Fehler: ${failed}`);
}

if (import.meta.main) await main();
