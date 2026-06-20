"use client";

import { useState } from "react";
import {
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";

// Zielfelder einer Akte (Teilmenge von CaseFrontmatter). Aktenlisten-Exporte
// aus RA-MICRO, Advoware und DATEV Anwalt sind CSV — der Import mappt die
// Spalten auf diese Felder. Ehrlich: kein proprietärer Parser, sondern ein
// generischer CSV-Import mit Spalten-Zuordnung, der mit jedem dieser Exporte
// funktioniert.
const FIELDS = [
  { key: "title", label: "Bezeichnung / Rubrum", required: true, guess: /(rubrum|bezeichnung|kurzbez|betreff|sache|gegenstand|kurzrubrum)/i },
  { key: "case_number", label: "Aktenzeichen", required: false, guess: /(aktenz|akten-?nr|az\b|aktennummer|registernummer)/i },
  { key: "client_name", label: "Mandant", required: false, guess: /(mandant|auftraggeber|kläger|klient)/i },
  { key: "opponent_name", label: "Gegner", required: false, guess: /(gegner|gegenseite|beklagt|gegenpartei)/i },
  { key: "legal_area", label: "Rechtsgebiet", required: false, guess: /(rechtsgebiet|sachgebiet|referat|fachgebiet)/i },
  { key: "court_name", label: "Gericht", required: false, guess: /(gericht|instanz)/i },
  { key: "own_lawyer_name", label: "Sachbearbeiter", required: false, guess: /(sachbearb|anwalt|bearbeiter|dezernent|sb\b)/i },
  { key: "status", label: "Status", required: false, guess: /(status|stand|zustand)/i },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

/** Generischer CSV/Delimited-Parser: erkennt ; oder , und behandelt "…"-Quotes. */
function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, ""); // BOM weg
  const firstLine = clean.split(/\r?\n/)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((v) => v.trim() !== "")) rows.push(row); }
  return rows;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export default function ImportKanzleiPage() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, number>>({} as Record<FieldKey, number>);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseDelimited(String(reader.result));
        if (parsed.length < 2) { setError("Datei enthält keine Datenzeilen."); return; }
        const head = parsed[0].map((h) => h.trim());
        const body = parsed.slice(1);
        // Auto-Mapping per Header-Heuristik.
        const guess = {} as Record<FieldKey, number>;
        for (const f of FIELDS) {
          guess[f.key] = head.findIndex((h) => f.guess.test(h));
        }
        setHeaders(head);
        setRows(body);
        setMapping(guess);
        setFileName(file.name);
      } catch {
        setError("Datei konnte nicht gelesen werden. Ist es eine CSV (UTF-8)?");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  const titleCol = mapping.title ?? -1;
  const canImport = headers.length > 0 && titleCol >= 0 && rows.length > 0 && !importing;

  async function runImport() {
    setImporting(true);
    setProgress(0);
    setResult(null);
    setError(null);
    let ok = 0;
    let failed = 0;
    const seen = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const val = (key: FieldKey): string | undefined => {
        const idx = mapping[key];
        const v = idx != null && idx >= 0 ? (row[idx] ?? "").trim() : "";
        return v || undefined;
      };
      const title = val("title") || val("case_number") || `Akte ${i + 1}`;
      let slug = `legal/cases/${slugify(val("case_number") || title) || `row-${i + 1}`}`;
      if (seen.has(slug)) slug = `${slug}-${i + 1}`;
      seen.add(slug);
      try {
        await api.brain.createPage({
          slug,
          title,
          type: "legal_case",
          frontmatter: {
            type: "legal_case",
            case_number: val("case_number"),
            client_name: val("client_name"),
            opponent_name: val("opponent_name"),
            legal_area: val("legal_area"),
            court_name: val("court_name"),
            own_lawyer_name: val("own_lawyer_name"),
            status: val("status") || "active",
            source: "kanzlei-import",
            imported_at: new Date().toISOString(),
          },
        });
        ok++;
      } catch {
        failed++;
      }
      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }
    setResult({ ok, failed });
    setImporting(false);
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Kanzlei-Import"
        description="Aktenliste aus RA-MICRO, Advoware oder DATEV Anwalt (CSV) übernehmen"
      />

      {/* Honest framing */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-blue-500/20 bg-blue-500/5" role="note">
        <Info size={16} className="text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-blue-700/90 leading-relaxed">
          Exportiere die Aktenliste deiner Kanzleisoftware als <strong>CSV</strong> (RA-MICRO, Advoware
          und DATEV Anwalt können das) und lade sie hier hoch. Die Spalten werden automatisch zugeordnet —
          <strong> prüfe die Zuordnung</strong>, bevor du importierst. Umlaute falsch? Datei als UTF-8 neu speichern.
          Es werden nur Stammdaten übernommen, keine Dokumente.
        </p>
      </div>

      {/* Upload */}
      <label className={cn(
        "flex flex-col items-center justify-center gap-2 py-10 rounded-xl border border-dashed cursor-pointer transition-all duration-300",
        headers.length ? "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]" : "border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-500/50"
      )}>
        <UploadCloud size={28} className="text-blue-600" aria-hidden="true" />
        <span className="text-sm text-[color:var(--ds-text)]">{fileName || "CSV-Datei wählen oder hierher ziehen"}</span>
        {headers.length > 0 && <span className="text-xs text-[color:var(--ds-text-muted)]">{rows.length} Zeilen erkannt · andere Datei wählen</span>}
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </label>

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      {/* Mapping + preview */}
      {headers.length > 0 && (
        <>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-3">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Spalten zuordnen</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <label htmlFor={`map-${f.key}`} className="text-xs text-[color:var(--ds-text-muted)] w-36 shrink-0">
                    {f.label}{f.required && <span className="text-red-600"> *</span>}
                  </label>
                  <select
                    id={`map-${f.key}`}
                    value={mapping[f.key] ?? -1}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                    className="flex-1 bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-2 py-1.5 text-xs text-[color:var(--ds-text)] focus:outline-none focus:border-blue-500/50"
                  >
                    <option value={-1}>— nicht importieren —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Spalte ${i + 1}`}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {titleCol < 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1.5">
                <AlertTriangle size={12} /> „Bezeichnung / Rubrum&quot; muss zugeordnet sein.
              </p>
            )}
          </div>

          {/* Preview (first 5) */}
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 overflow-x-auto">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)] mb-3">Vorschau (erste 5)</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[color:var(--ds-text-muted)]">
                  {FIELDS.filter((f) => (mapping[f.key] ?? -1) >= 0).map((f) => (
                    <th key={f.key} scope="col" className="pb-2 pr-3 font-medium">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, ri) => (
                  <tr key={ri} className="border-t border-[color:var(--ds-border)]">
                    {FIELDS.filter((f) => (mapping[f.key] ?? -1) >= 0).map((f) => (
                      <td key={f.key} className="py-1.5 pr-3 text-[color:var(--ds-text)] max-w-[180px] truncate">
                        {r[mapping[f.key]] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Import */}
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
              disabled={!canImport}
              onClick={runImport}
            >
              {importing ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {importing ? `Importiere… ${progress}%` : `${rows.length} Akten importieren`}
            </Button>
            {result && (
              <span className="text-sm flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-emerald-600" />
                <span className="text-emerald-600">{result.ok} importiert</span>
                {result.failed > 0 && <span className="text-red-600">· {result.failed} fehlgeschlagen</span>}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
