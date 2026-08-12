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
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { contentHash } from "./backfill-utils";

const args = process.argv.slice(2);
const arg = (n: string, d?: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const CORPUS = arg("--corpus", "Bezirke")!;
const DRY = args.includes("--dry-run");
const LIMIT = parseInt(arg("--limit", "0")!, 10);
const RATE_MS = parseInt(arg("--rate-ms", "1200")!, 10);
const NO_LOCK = args.includes("--no-lock");

const UA = "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)";
const API = "https://data.bka.gv.at/ris/api/v2.6";
const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "..", "law-corpus");

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
  KmGer: { endpoint: "Sonstige", applikation: "KmGer", dir: "at-kmger", container: "Sonstige", detail: "KmGer" },
};

const cfg = CONFIG[CORPUS];
if (!cfg) { console.error(`--corpus muss Bezirke oder KmGer sein`); process.exit(1); }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const one = <T,>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);
const all = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** `{ item: "x" }` oder `{ item: ["x","y"] }` — RIS liefert beides. */
function items(v: any): string[] {
  if (v == null) return [];
  const inner = v.item ?? v;
  return all<any>(inner).map((x) => String(x).trim()).filter(Boolean);
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

function yamlStr(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** PDF → Text über die eingebettete Textschicht. Kein OCR. */
async function pdfToText(buf: ArrayBuffer): Promise<string> {
  const tmp = join(process.env.TMPDIR ?? "/tmp", `ris-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`);
  writeFileSync(tmp, Buffer.from(buf));
  try {
    const proc = Bun.spawn(["pdftotext", "-layout", "-enc", "UTF-8", tmp, "-"], {
      stdout: "pipe", stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return out;
  } finally {
    try { unlinkSync(tmp); } catch { /* egal */ }
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
  id: string; title: string; pdfUrl: string;
  kundmachungsdatum: string | null; typ: string | null;
  behoerde: string | null; bundesland: string | null;
  kundmachungsorgan: string | null; inkrafttreten: string | null;
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
      v == null ? null : String(v).replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim() || null;

    const id = String(tech.ID ?? pdf.split("/").slice(-2)[0]);
    const title =
      norm(cont.Titel) ?? norm(cont.Kurztitel) ?? norm(spec.Kurzinformation) ?? id;

    docs.push({
      id, title, pdfUrl: pdf,
      kundmachungsdatum: spec.Kundmachungsdatum ?? cont.Kundmachungsdatum ?? null,
      typ: norm(spec.Typ),
      behoerde: norm(spec.Bezirksverwaltungsbehoerde ?? spec.Gericht ?? tech.Organ),
      bundesland: norm(cont.Bundesland),
      kundmachungsorgan: norm([spec.Kundmachungsorgan, spec.Kundmachungsnummer].filter(Boolean).join(" ")),
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
  ].filter(Boolean).join("\n");
  return `${fm}\n\n# ${d.title}\n\n${body}\n`;
}

async function main() {
  const outDir = join(CORPUS_ROOT, cfg.dir);
  console.log(`Korpus:    ${CORPUS} (${cfg.endpoint}${cfg.applikation ? "/" + cfg.applikation : ""})`);
  console.log(`Ziel:      ${outDir}`);
  console.log(`Rate:      ${RATE_MS}ms   ${DRY ? "[DRY-RUN]" : ""}`);

  if (!NO_LOCK && !DRY) {
    console.log("Warte auf RIS-Lock (RIS-OGD erlaubt nur eine aktive Verbindung)…");
    await acquireRisLock();
    console.log("RIS-Lock erhalten.");
  }

  let written = 0, failed = 0, emptyText = 0, page = 1, total = 0;
  try {
    for (;;) {
      const { docs, total: t } = await fetchPage(page);
      if (page === 1) { total = t; console.log(`RIS meldet ${total} Dokumente.\n`); }
      if (docs.length === 0) break;

      for (const d of docs) {
        if (LIMIT && written >= LIMIT) { console.log("\nLimit erreicht."); return; }
        try {
          const res = await fetch(d.pdfUrl, { headers: { "User-Agent": UA } });
          if (!res.ok) { failed++; console.log(`  ✗ HTTP ${res.status}  ${d.id}`); continue; }
          const text = cleanPdfText(await pdfToText(await res.arrayBuffer()));

          // Ohne Textschicht kein Volltext — lieber gar nichts schreiben als
          // eine Datei, die Inhalt vortäuscht.
          if (text.length < 120) {
            emptyText++;
            console.log(`  ⊘ kein Text (${text.length} Zeichen)  ${d.id}`);
            continue;
          }

          const file = join(outDir, `${slugify(d.title || d.id)}-${slugify(d.id).slice(-24)}.md`);
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
        await sleep(RATE_MS);
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
