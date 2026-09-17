"use client";

import { useState } from "react";
import {
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowRight,
  FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import {
  createMigrationProject,
  setFieldMappings,
  runDryRun,
  validateMigration,
  startImport,
  completeMigration,
  failMigration,
  validateMigrationProject,
  getUnmappedRequiredFields,
  type MigrationProject,
  type FieldMapping,
  type DryRunResult,
  type CutoverReport,
} from "@/lib/migration-project";

// Zielfelder einer Akte (Teilmenge von CaseFrontmatter). Aktenlisten-Exporte
// aus RA-MICRO, Advoware und DATEV Anwalt sind CSV — der Import mapmt die
// Spalten auf diese Felder. Ehrlich: kein proprietärer Parser, sondern ein
// generischer CSV-Import mit Spalten-Zuordnung, der mit jedem dieser Exporte
// funktioniert.
type TFunc = (key: import("@/content/dashboard").DashboardKey) => string;

interface ImportIssue {
  row: number;
  title: string;
  reason: string;
}
interface ImportResult {
  ok: number;
  failed: number;
  skipped: number;
  issues: ImportIssue[];
  createdSlugs: string[];
  rolledBack?: number;
}

const normaliseNumber = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");

function getFields(t: TFunc) {
  return [
    {
      key: "title",
      label: t("importkanz.field.title"),
      required: true,
      guess: /(rubrum|bezeichnung|kurzbez|betreff|sache|gegenstand|kurzrubrum)/i,
    },
    {
      key: "case_number",
      label: t("importkanz.field.case_number"),
      required: false,
      guess: /(aktenz|akten-?nr|az\b|aktennummer|registernummer|geschäftszahl|gz\b)/i,
    },
    {
      key: "client_name",
      label: t("importkanz.field.client_name"),
      required: false,
      guess: /(mandant|auftraggeber|kläger|klient)/i,
    },
    {
      key: "opponent_name",
      label: t("importkanz.field.opponent_name"),
      required: false,
      guess: /(gegner|gegenseite|beklagt|gegenpartei)/i,
    },
    {
      key: "legal_area",
      label: t("importkanz.field.legal_area"),
      required: false,
      guess: /(rechtsgebiet|sachgebiet|referat|fachgebiet)/i,
    },
    {
      key: "court_name",
      label: t("importkanz.field.court_name"),
      required: false,
      guess: /(gericht|instanz)/i,
    },
    {
      key: "own_lawyer_name",
      label: t("importkanz.field.own_lawyer_name"),
      required: false,
      guess: /(sachbearb|anwalt|bearbeiter|dezernent|sb\b)/i,
    },
    {
      key: "status",
      label: t("importkanz.field.status"),
      required: false,
      guess: /(status|stand|zustand)/i,
    },
  ] as const;
}

type FieldKey = ReturnType<typeof getFields>[number]["key"];

/** Generischer CSV/Delimited-Parser: erkennt ; oder , und behandelt "…"-Quotes. */
function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, ""); // BOM weg
  const firstLine = clean.split(/\r?\n/)[0] ?? "";
  const delim =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }
  return rows;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export default function ImportKanzleiPage() {
  const { t } = useLang();
  const FIELDS = getFields(t);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, number>>({} as Record<FieldKey, number>);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Migration-project tracking (src/lib/migration-project.ts) — was dead
  // code before: this CSV import ran with no project record, no dry-run
  // gate, and no cutover report. Persisted as a brain page (type
  // "migration_project"), same pattern as the other dashboard import flows.
  const [project, setProject] = useState<MigrationProject | null>(null);
  const [dryRunning, setDryRunning] = useState(false);

  function buildFieldMappings(): FieldMapping[] {
    return FIELDS.map((f) => {
      const idx = mapping[f.key] ?? -1;
      return {
        source_field: idx >= 0 ? (headers[idx] ?? `col_${idx}`) : "",
        target_field: f.key,
        status: idx < 0 ? "unmapped" : "auto_mapped",
        required: f.required,
      };
    });
  }

  function runDryRunCheck(): { project: MigrationProject; result: DryRunResult } {
    const base =
      project ??
      createMigrationProject({
        name: fileName || "Kanzlei-Import",
        brain_id: "default",
        org_id: "default",
        source_system: "csv",
        source_path: fileName,
        created_by: "dashboard-user",
      });
    const mapped = setFieldMappings(base, buildFieldMappings(), "dashboard-user");

    let errorCount = 0;
    const warnings: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (titleCol < 0 || !(rows[i][titleCol] ?? "").trim()) errorCount++;
    }
    const unmapped = getUnmappedRequiredFields(mapped);
    if (unmapped.length > 0) {
      warnings.push(
        `${unmapped.length} Pflichtfeld(er) nicht zugeordnet: ${unmapped.map((m) => m.target_field).join(", ")}`
      );
    }
    const total = rows.length;
    const failedRows = errorCount;
    const dryRun: DryRunResult = {
      run_at: new Date().toISOString(),
      stats: {
        total_records: total,
        processed_records: total,
        successful_records: total - failedRows,
        failed_records: failedRows,
        skipped_records: 0,
        error_rate: total > 0 ? Math.round((failedRows / total) * 1000) / 10 : 0,
        success_rate: total > 0 ? Math.round(((total - failedRows) / total) * 1000) / 10 : 0,
      },
      errors: [],
      warnings,
      sample_records: rows.slice(0, 3),
    };
    const withDryRun = runDryRun(mapped, dryRun, "dashboard-user");
    return { project: withDryRun, result: dryRun };
  }

  function handleFile(file: File) {
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseDelimited(String(reader.result));
        if (parsed.length < 2) {
          setError(t("importkanz.error_no_data"));
          return;
        }
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
  const canDryRun =
    headers.length > 0 && titleCol >= 0 && rows.length > 0 && !importing && !dryRunning;
  // A successful dry run leaves the project "validated"; only "dry_run" was
  // accepted before, so the import button never became active.
  const dryRunOk =
    (project?.status === "dry_run" || project?.status === "validated") &&
    (project.dry_run_result?.stats.error_rate ?? 100) < 50;
  const canImport = dryRunOk && !importing;

  async function persistProject(p: MigrationProject): Promise<void> {
    await api.brain.createPage({
      slug: `legal/migration-projects/${p.id}`,
      title: `Migration: ${p.name}`,
      type: "migration_project",
      frontmatter: { project: p },
    });
    setProject(p);
  }

  /** Dry run: validates mappings + estimates error rate WITHOUT writing any case pages. */
  async function runDryRunStep() {
    setDryRunning(true);
    setError(null);
    try {
      const { project: withDryRun } = runDryRunCheck();
      const validation = validateMigrationProject(withDryRun);
      const validated = validation.valid
        ? validateMigration(withDryRun, "dashboard-user")
        : withDryRun;
      await persistProject(validated);
      if (!validation.valid) {
        setError(`Dry Run zeigt Probleme: ${validation.errors.join("; ")}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dry Run fehlgeschlagen.");
    } finally {
      setDryRunning(false);
    }
  }

  async function runImport() {
    if (!project) return;
    setImporting(true);
    setProgress(0);
    setResult(null);
    setError(null);
    const startedAt = Date.now();
    let ok = 0;
    let failed = 0;
    let skipped = 0;
    const issues: ImportIssue[] = [];
    const createdSlugs: string[] = [];

    // Never overwrite: the page API creates OR updates, so a matter with the
    // same id or case number would lose its deadlines and documents.
    let existing: Array<{ slug: string; frontmatter?: Record<string, unknown> }> = [];
    try {
      existing = (await api.brain.listPages({
        type: "legal_case",
        limit: 5000,
      })) as typeof existing;
    } catch {
      setError("Bestehende Akten konnten nicht geladen werden. Der Import wurde nicht gestartet.");
      setImporting(false);
      return;
    }
    const existingSlugs = new Set(existing.map((p) => p.slug));
    const existingNumbers = new Set(
      existing.map((p) => normaliseNumber(p.frontmatter?.case_number)).filter(Boolean)
    );

    const seen = new Set<string>();
    let imported = startImport(project, "dashboard-user");
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const val = (key: FieldKey): string | undefined => {
        const idx = mapping[key];
        const v = idx != null && idx >= 0 ? (row[idx] ?? "").trim() : "";
        return v || undefined;
      };
      const title = val("title") || val("case_number") || `Akte ${i + 1}`;
      const caseNumber = val("case_number");
      setProgress(Math.round(((i + 1) / rows.length) * 100));
      if (!val("title")) {
        failed++;
        issues.push({ row: i + 2, title, reason: "Titel fehlt" });
        continue;
      }
      if (caseNumber && existingNumbers.has(normaliseNumber(caseNumber))) {
        skipped++;
        issues.push({ row: i + 2, title, reason: `Aktenzahl ${caseNumber} existiert bereits` });
        continue;
      }
      let slug = `legal/cases/${slugify(caseNumber || title) || `row-${i + 1}`}`;
      if (seen.has(slug) || existingSlugs.has(slug)) slug = `${slug}-import-${i + 1}`;
      if (existingSlugs.has(slug)) {
        skipped++;
        issues.push({ row: i + 2, title, reason: "Akte existiert bereits" });
        continue;
      }
      seen.add(slug);
      try {
        await api.brain.createPage({
          slug,
          title,
          type: "legal_case",
          frontmatter: {
            type: "legal_case",
            case_number: caseNumber,
            client_name: val("client_name"),
            opponent_name: val("opponent_name"),
            legal_area: val("legal_area"),
            court_name: val("court_name"),
            own_lawyer_name: val("own_lawyer_name"),
            status: val("status") || "active",
            source: "kanzlei-import",
            import_project_id: project.id,
            imported_at: new Date().toISOString(),
          },
        });
        ok++;
        createdSlugs.push(slug);
        existingSlugs.add(slug);
        if (caseNumber) existingNumbers.add(normaliseNumber(caseNumber));
      } catch (err) {
        failed++;
        issues.push({
          row: i + 2,
          title,
          reason: err instanceof Error ? err.message : "Speichern fehlgeschlagen",
        });
      }
    }
    setResult({ ok, failed, skipped, issues, createdSlugs });
    const postStats = {
      total_records: rows.length,
      processed_records: rows.length,
      successful_records: ok,
      failed_records: failed,
      skipped_records: skipped,
      error_rate: rows.length > 0 ? Math.round((failed / rows.length) * 1000) / 10 : 0,
      success_rate: rows.length > 0 ? Math.round((ok / rows.length) * 1000) / 10 : 0,
    };
    const report: CutoverReport = {
      generated_at: new Date().toISOString(),
      pre_import_stats: imported.dry_run_result?.stats ?? postStats,
      post_import_stats: postStats,
      delta_stats: postStats,
      duration_seconds: Math.round((Date.now() - startedAt) / 1000),
      rollback_available: createdSlugs.length > 0,
      summary: `${ok} Akten importiert, ${skipped} übersprungen, ${failed} fehlgeschlagen.`,
    };
    imported =
      failed > 0 && ok === 0
        ? failMigration(imported, report.summary, "dashboard-user")
        : completeMigration(imported, report, "dashboard-user");
    await persistProject(imported);
    setImporting(false);
  }

  /** Archives exactly the matters this import created (matters are never hard-deleted). */
  async function rollbackImport() {
    if (!result || result.createdSlugs.length === 0) return;
    if (!window.confirm(`${result.createdSlugs.length} importierte Akten archivieren?`)) return;
    setRollingBack(true);
    let removed = 0;
    for (const slug of result.createdSlugs) {
      try {
        await api.brain.deletePage(slug);
        removed++;
      } catch {
        // keep going; the count shows what was removed
      }
    }
    setResult({ ...result, createdSlugs: [], rolledBack: removed });
    setRollingBack(false);
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("importkanzlei.title")}
        description={t("importkanzlei.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("importkanzlei.breadcrumb") },
        ]}
      />

      {/* Honest framing */}
      <div
        className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] px-4 py-3"
        role="note"
      >
        <Info
          size={16}
          className="mt-0.5 shrink-0 text-[color:var(--ds-info-text)]"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-[color:var(--ds-info-text)]">
          {t("importkanz.info")}
        </p>
      </div>

      {/* Upload */}
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          headers.length
            ? "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
            : "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] hover:border-[color:var(--ds-info-border)] hover:bg-[color:var(--ds-info-bg)]"
        )}
      >
        <UploadCloud size={28} className="text-[color:var(--ds-info-text)]" aria-hidden="true" />
        <span className="text-sm text-[color:var(--ds-text)]">
          {fileName || t("importkanz.choose_file")}
        </span>
        {headers.length > 0 && (
          <span className="text-xs text-[color:var(--ds-text-muted)]">
            {rows.length} {t("importkanz.rows_detected")}
          </span>
        )}
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </label>

      {error && (
        <p className="text-sm text-[color:var(--ds-danger-text)]" role="alert">
          {error}
        </p>
      )}

      {/* Mapping + preview */}
      {headers.length > 0 && (
        <>
          <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Spalten zuordnen</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <label
                    htmlFor={`map-${f.key}`}
                    className="w-36 shrink-0 text-xs text-[color:var(--ds-text-muted)]"
                  >
                    {f.label}
                    {f.required && <span className="text-[color:var(--ds-danger-text)]"> *</span>}
                  </label>
                  <select
                    id={`map-${f.key}`}
                    value={mapping[f.key] ?? -1}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                    className="flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1.5 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--ds-info-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                  >
                    <option value={-1}>— nicht importieren —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Spalte ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {titleCol < 0 && (
              <p className="flex items-center gap-1.5 text-xs text-[color:var(--ds-warning-text)]">
                <AlertTriangle size={12} /> „Bezeichnung / Rubrum&quot; muss zugeordnet sein.
              </p>
            )}
          </div>

          {/* Preview (first 5) */}
          <div className="overflow-x-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold text-[color:var(--ds-text)]">
              Vorschau (erste 5)
            </h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[color:var(--ds-text-muted)]">
                  {FIELDS.filter((f) => (mapping[f.key] ?? -1) >= 0).map((f) => (
                    <th key={f.key} scope="col" className="pr-3 pb-2 font-medium">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, ri) => (
                  <tr key={ri} className="border-t border-[color:var(--ds-border)]">
                    {FIELDS.filter((f) => (mapping[f.key] ?? -1) >= 0).map((f) => (
                      <td
                        key={f.key}
                        className="max-w-[180px] truncate py-1.5 pr-3 text-[color:var(--ds-text)]"
                      >
                        {r[mapping[f.key]] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Dry Run — validates mappings + estimates error rate, writes nothing */}
          <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
              <FlaskConical
                size={14}
                className="text-[color:var(--ds-info-text)]"
                aria-hidden="true"
              />
              Dry Run
            </h2>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {t("importkanz.dry_run_desc")}
            </p>
            <Button
              variant="secondary"
              className="gap-2"
              disabled={!canDryRun}
              onClick={() => void runDryRunStep()}
            >
              {dryRunning ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FlaskConical size={14} />
              )}
              {dryRunning ? t("importkanz.dry_run_checking") : t("importkanz.dry_run_start")}
            </Button>
            {project?.dry_run_result && (
              <div className="space-y-1 text-xs text-[color:var(--ds-text-muted)]">
                <p>
                  Erfolgsquote: <strong>{project.dry_run_result.stats.success_rate}%</strong> ·
                  Fehlerquote: <strong>{project.dry_run_result.stats.error_rate}%</strong>
                </p>
                {project.dry_run_result.warnings.map((w, i) => (
                  <p
                    key={i}
                    className="flex items-center gap-1.5 text-[color:var(--ds-warning-text)]"
                  >
                    <AlertTriangle size={11} aria-hidden="true" /> {w}
                  </p>
                ))}
                {dryRunOk ? (
                  <p className="flex items-center gap-1.5 text-[color:var(--ds-success-text)]">
                    <CheckCircle2 size={11} aria-hidden="true" /> {t("importkanz.dry_run_ready")}
                  </p>
                ) : (
                  <p className="text-[color:var(--ds-danger-text)]">
                    {t("importkanz.dry_run_error")}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Import */}
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              className="gap-2 bg-[color:var(--ds-info-solid)] text-white hover:bg-[color:var(--ds-info-solid)]"
              disabled={!canImport}
              onClick={runImport}
            >
              {importing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ArrowRight size={16} />
              )}
              {importing ? `Importiere… ${progress}%` : `${rows.length} Akten importieren`}
            </Button>
            {!canImport && !importing && (
              <span className="text-xs text-[color:var(--ds-text-muted)]">
                {t("importkanz.need_dry_run")}
              </span>
            )}
          </div>
          {result && (
            <section
              aria-label="Ergebnis des Imports"
              className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-sm"
            >
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <CheckCircle2
                  size={15}
                  className="text-[color:var(--ds-success-text)]"
                  aria-hidden
                />
                <span className="text-[color:var(--ds-success-text)]">{result.ok} importiert</span>
                {result.skipped > 0 && <span>{result.skipped} übersprungen</span>}
                {result.failed > 0 && (
                  <span className="text-[color:var(--ds-danger-text)]">
                    {result.failed} fehlgeschlagen
                  </span>
                )}
                {result.rolledBack !== undefined && <span>{result.rolledBack} archiviert</span>}
              </p>
              {result.issues.length > 0 && (
                <div className="max-h-64 overflow-auto rounded-md border border-[color:var(--ds-border)]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[color:var(--ds-text-muted)]">
                        <th className="px-3 py-2 font-medium">Zeile</th>
                        <th className="px-3 py-2 font-medium">Akte</th>
                        <th className="px-3 py-2 font-medium">Grund</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.issues.map((issue) => (
                        <tr
                          key={`${issue.row}-${issue.reason}`}
                          className="border-t border-[color:var(--ds-border)]"
                        >
                          <td className="px-3 py-1.5 tabular-nums">{issue.row}</td>
                          <td className="px-3 py-1.5">{issue.title}</td>
                          <td className="px-3 py-1.5">{issue.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.createdSlugs.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={rollingBack}
                  onClick={() => void rollbackImport()}
                >
                  {rollingBack ? "Wird archiviert…" : "Importierte Akten archivieren"}
                </Button>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
