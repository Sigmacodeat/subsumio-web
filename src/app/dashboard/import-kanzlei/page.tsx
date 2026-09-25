"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  History,
  Loader2,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { api, ApiRequestError } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useLang } from "@/lib/use-lang";
import {
  completeMigration,
  createMigrationProject,
  failMigration,
  runDryRun,
  setFieldMappings,
  startImport,
  validateMigration,
  type CutoverReport,
  type DryRunResult,
  type FieldMapping,
  type MigrationProject,
} from "@/lib/migration-project";
import {
  IMPORT_KINDS,
  guessMapping,
  missingMappings,
  type ColumnMapping,
  type ImportKind,
} from "@/lib/kanzlei-import/fields";
import { readImportFile, type ImportTable } from "@/lib/kanzlei-import/parse";
import {
  planImport,
  type ExistingData,
  type ExistingPage,
  type ImportPlan,
  type PlanAction,
} from "@/lib/kanzlei-import/plan";
import {
  executeImport,
  rollbackImport,
  type ImportClient,
  type ImportOutcome,
  type ImportRefs,
  type RollbackResult,
  type RowStatus,
} from "@/lib/kanzlei-import/run";

const KIND_ORDER: ImportKind[] = ["cases", "contacts", "deadlines", "time_entries"];
/** The engine returns at most this many pages per list request. */
const LIST_PAGE_SIZE = 100;

const ACTION_LABEL: Record<PlanAction, string> = {
  create: "Neu",
  complete: "Ergänzen",
  skip: "Übersprungen",
  error: "Fehler",
};
const STATUS_LABEL: Record<RowStatus, string> = {
  imported: "Importiert",
  completed: "Ergänzt",
  skipped: "Übersprungen",
  failed: "Fehlgeschlagen",
};
const TONE: Record<PlanAction | RowStatus, string> = {
  create: "text-[color:var(--ds-success-text)]",
  imported: "text-[color:var(--ds-success-text)]",
  complete: "text-[color:var(--ds-info-text)]",
  completed: "text-[color:var(--ds-info-text)]",
  skip: "text-[color:var(--ds-text-muted)]",
  skipped: "text-[color:var(--ds-text-muted)]",
  error: "text-[color:var(--ds-danger-text)]",
  failed: "text-[color:var(--ds-danger-text)]",
};

interface HistoryEntry {
  slug: string;
  project: MigrationProject;
  kind: ImportKind;
  refs?: ImportRefs;
  counts?: Record<RowStatus, number>;
  rolledBackAt?: string;
}

async function listAll(type: string): Promise<ExistingPage[]> {
  const out: ExistingPage[] = [];
  for (let offset = 0; offset < 50_000; offset += LIST_PAGE_SIZE) {
    // Deleted records must count for the batch size, or paging stops early.
    const batch = (await api.brain.listPages({
      type,
      limit: LIST_PAGE_SIZE,
      offset,
      includeTombstoned: true,
    })) as ExistingPage[];
    out.push(...batch);
    if (batch.length < LIST_PAGE_SIZE) break;
  }
  // Paging by "recently updated" can return a page twice when it changes meanwhile.
  return [...new Map(out.map((p) => [p.slug, p])).values()];
}

const importClient: ImportClient = {
  async getPage(slug) {
    try {
      return (await api.brain.getPage(slug)) as {
        slug: string;
        title?: string;
        frontmatter?: Record<string, unknown>;
      };
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) return null;
      throw err;
    }
  },
  async createPage(page) {
    await api.brain.createPage(page);
  },
  async updatePage(page) {
    await api.brain.updatePage(page);
  },
  async deletePage(slug) {
    try {
      await api.brain.deletePage(slug);
    } catch (err) {
      // A matter imported as closed is archived already.
      if (err instanceof ApiRequestError && err.status === 409) return;
      throw err;
    }
  },
  // Atomic engine ops — import/rollback append and remove time_entries
  // without a read-modify-write window on the whole array.
  async appendPageArray(slug, field, items) {
    return api.brain.appendPageArray(slug, field, items);
  },
  async mutatePageArray(slug, field, mutation) {
    return api.brain.mutatePageArray(slug, field, mutation);
  },
};

function todayInVienna(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(new Date());
}

function kindOf(value: unknown): ImportKind {
  return KIND_ORDER.includes(value as ImportKind) ? (value as ImportKind) : "cases";
}

/** Nur eigene, deutsche Fehlertexte zeigen — technische Meldungen werden ersetzt. */
function friendlyReadError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  return /^(Die|Das|Bitte) /.test(msg)
    ? msg
    : "Die Datei konnte nicht gelesen werden. Bitte speichern Sie sie als CSV oder Excel (.xlsx).";
}

function describeRollback(r: RollbackResult): string {
  const parts = [
    r.archivedCases && `${r.archivedCases} Akten archiviert`,
    r.removedRecords && `${r.removedRecords} Einträge entfernt`,
    r.removedTimeEntries && `${r.removedTimeEntries} Zeiteinträge entfernt`,
    r.revertedContacts && `${r.revertedContacts} Kontakte zurückgesetzt`,
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")}.` : "Nichts mehr zurückzunehmen.";
}

export default function ImportKanzleiPage() {
  const { t } = useLang();
  const confirm = useConfirm();
  const [kind, setKind] = useState<ImportKind>("cases");
  const [table, setTable] = useState<ImportTable | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [includePast, setIncludePast] = useState(false);
  const [defaultBilled, setDefaultBilled] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [project, setProject] = useState<MigrationProject | null>(null);
  const [filter, setFilter] = useState<PlanAction | "all">("all");
  const [busy, setBusy] = useState<"read" | "plan" | "import" | "rollback" | null>(null);
  const [progress, setProgress] = useState(0);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [rollback, setRollback] = useState<RollbackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const def = IMPORT_KINDS[kind];
  const missing = table ? missingMappings(kind, mapping) : [];

  const loadHistory = useCallback(async () => {
    try {
      const pages = await api.brain.listPages({ type: "migration_project", limit: LIST_PAGE_SIZE });
      const entries: HistoryEntry[] = [];
      for (const p of pages) {
        const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
        const proj = fm.project as MigrationProject | undefined;
        const refs = fm.created_refs as ImportRefs | undefined;
        if (!proj || !refs) continue;
        entries.push({
          slug: p.slug,
          project: proj,
          kind: kindOf(fm.import_kind),
          refs,
          counts: fm.outcome_counts as Record<RowStatus, number> | undefined,
          rolledBackAt: typeof fm.rolled_back_at === "string" ? fm.rolled_back_at : undefined,
        });
      }
      entries.sort((a, b) =>
        (b.project.updated_at ?? "").localeCompare(a.project.updated_at ?? "")
      );
      setHistory(entries.slice(0, 10));
    } catch {
      // History is a convenience; the import works without it.
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  function resetPlan() {
    setPlan(null);
    setProject(null);
    setOutcome(null);
    setRollback(null);
    setFilter("all");
  }

  function chooseKind(next: ImportKind) {
    setKind(next);
    resetPlan();
    if (table) setMapping(guessMapping(next, table.headers));
  }

  async function handleFile(file: File) {
    setError(null);
    resetPlan();
    setBusy("read");
    try {
      const read = await readImportFile(file);
      setTable(read);
      setFileName(file.name);
      setMapping(guessMapping(kind, read.headers));
    } catch (err) {
      setTable(null);
      setFileName("");
      setError(friendlyReadError(err));
    } finally {
      setBusy(null);
    }
  }

  function fieldMappings(): FieldMapping[] {
    return def.fields.map((f) => {
      const idx = mapping[f.key] ?? -1;
      return {
        source_field: idx >= 0 && table ? (table.headers[idx] ?? `Spalte ${idx + 1}`) : "",
        target_field: f.key,
        status: idx < 0 ? "unmapped" : "auto_mapped",
        required: f.required,
      };
    });
  }

  async function persist(p: MigrationProject, extra: Record<string, unknown> = {}): Promise<void> {
    await api.brain.createPage({
      slug: `legal/migration-projects/${p.id}`,
      title: `Import ${IMPORT_KINDS[kindOf(extra.import_kind ?? kind)].label}: ${p.name}`,
      type: "migration_project",
      frontmatter: { project: p, import_kind: kind, ...extra },
    });
    setProject(p);
  }

  async function runDryRunStep() {
    if (!table) return;
    setBusy("plan");
    setError(null);
    setOutcome(null);
    setRollback(null);
    try {
      const [cases, contacts, deadlines] = await Promise.all([
        listAll("legal_case"),
        kind === "contacts" ? listAll("legal_contact") : Promise.resolve([]),
        kind === "deadlines" ? listAll("legal_deadline") : Promise.resolve([]),
      ]);
      const existing: ExistingData = { cases, contacts, deadlines };
      const base = createMigrationProject({
        name: fileName || "Kanzlei-Import",
        brain_id: "current",
        org_id: "current",
        source_system: table.encoding === "xlsx" ? "excel" : "csv",
        source_path: fileName,
        created_by: "dashboard",
      });
      const nextPlan = planImport(kind, table.rows, mapping, existing, {
        projectId: base.id,
        today: todayInVienna(),
        now: new Date().toISOString(),
        includePastDeadlines: includePast,
        defaultBilled,
      });
      const total = nextPlan.rows.length;
      const failed = nextPlan.counts.error;
      const dryRun: DryRunResult = {
        run_at: new Date().toISOString(),
        stats: {
          total_records: total,
          processed_records: total,
          successful_records: nextPlan.counts.create + nextPlan.counts.complete,
          failed_records: failed,
          skipped_records: nextPlan.counts.skip,
          error_rate: total ? Math.round((failed / total) * 1000) / 10 : 0,
          success_rate: total
            ? Math.round(((nextPlan.counts.create + nextPlan.counts.complete) / total) * 1000) / 10
            : 0,
        },
        errors: [],
        warnings: [],
        sample_records: table.rows.slice(0, 3),
      };
      const checked = validateMigration(
        runDryRun(setFieldMappings(base, fieldMappings(), "dashboard"), dryRun, "dashboard"),
        "dashboard"
      );
      await persist(checked);
      setPlan(nextPlan);
    } catch {
      setError(
        "Der Probelauf konnte nicht abgeschlossen werden. Es wurde nichts übernommen — bitte versuchen Sie es erneut."
      );
    } finally {
      setBusy(null);
    }
  }

  async function runImport() {
    if (!plan || !project) return;
    setBusy("import");
    setProgress(0);
    setError(null);
    const startedAt = Date.now();
    let running = startImport(project, "dashboard");
    try {
      const result = await executeImport(plan, importClient, (done, total) =>
        setProgress(total ? Math.round((done / total) * 100) : 100)
      );
      setOutcome(result);
      const written = result.counts.imported + result.counts.completed;
      const stats = {
        total_records: result.rows.length,
        processed_records: result.rows.length,
        successful_records: written,
        failed_records: result.counts.failed,
        skipped_records: result.counts.skipped,
        error_rate: result.rows.length
          ? Math.round((result.counts.failed / result.rows.length) * 1000) / 10
          : 0,
        success_rate: result.rows.length
          ? Math.round((written / result.rows.length) * 1000) / 10
          : 0,
      };
      const report: CutoverReport = {
        generated_at: new Date().toISOString(),
        pre_import_stats: running.dry_run_result?.stats ?? stats,
        post_import_stats: stats,
        delta_stats: stats,
        duration_seconds: Math.round((Date.now() - startedAt) / 1000),
        rollback_available: written > 0,
        summary: `${result.counts.imported} importiert, ${result.counts.completed} ergänzt, ${result.counts.skipped} übersprungen, ${result.counts.failed} fehlgeschlagen.`,
      };
      running =
        written === 0 && result.counts.failed > 0
          ? failMigration(running, report.summary, "dashboard")
          : completeMigration(running, report, "dashboard");
      await persist(running, { created_refs: result.refs, outcome_counts: result.counts });
      void loadHistory();
    } catch {
      setError(
        "Der Import wurde abgebrochen. Bereits übernommene Einträge bleiben erhalten und lassen sich unter „Letzte Importe“ zurücknehmen."
      );
    } finally {
      setBusy(null);
    }
  }

  async function takeBack(entry: {
    slug: string;
    refs: ImportRefs;
    project: MigrationProject;
    kind: ImportKind;
  }): Promise<boolean> {
    const n =
      entry.refs.pages.length +
      entry.refs.contactCompletions.length +
      entry.refs.timeEntries.reduce((s, t) => s + t.ids.length, 0);
    const ok = await confirm({
      title: "Import zurücknehmen",
      message: `Import „${entry.project.name}“: ${n} Einträge werden archiviert, entfernt oder zurückgesetzt. Inzwischen geänderte oder verrechnete Einträge bleiben erhalten.`,
      confirmLabel: "Zurücknehmen",
      variant: "danger",
    });
    if (!ok) return false;
    setBusy("rollback");
    setError(null);
    try {
      const result = await rollbackImport(entry.refs, importClient);
      setRollback(result);
      await api.brain.updatePage({
        slug: entry.slug,
        frontmatter: { rolled_back_at: new Date().toISOString(), rollback_result: result },
      });
      void loadHistory();
      return true;
    } catch {
      setError("Der Import konnte nicht zurückgenommen werden. Bitte versuchen Sie es erneut.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const writable = plan ? plan.counts.create + plan.counts.complete : 0;
  const shownRows = useMemo(() => {
    if (outcome) return null;
    if (!plan) return [];
    return filter === "all" ? plan.rows : plan.rows.filter((r) => r.action === filter);
  }, [plan, filter, outcome]);
  const warningCount = plan ? plan.rows.filter((r) => r.warnings.length > 0).length : 0;

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("importkanzlei.title")}
        description={t("importkanzlei.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("importkanzlei.breadcrumb") },
        ]}
      />

      <div
        className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
        role="note"
      >
        <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
          Export aus RA-MICRO, Advoware, DATEV Anwalt oder Excel als CSV oder .xlsx. Reihenfolge:
          zuerst Akten, dann Kontakte, Fristen und Zeiten, denn diese werden über die Aktenzahl
          zugeordnet. Der Probelauf zeigt für jede Zeile, was passiert; vorhandene Daten werden nie
          überschrieben, und jeder Import lässt sich zurücknehmen.
        </p>
      </div>

      {/* 1 · Was */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-[color:var(--ds-text)]">
          Was importieren?
        </legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {KIND_ORDER.map((k) => (
            <label
              key={k}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-left transition-[background-color,border-color] motion-reduce:transition-none",
                kind === k
                  ? "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)]"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:bg-[color:var(--ds-hover)]"
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
                <input
                  type="radio"
                  name="import-kind"
                  id={`import-kind-${k}`}
                  value={k}
                  checked={kind === k}
                  onChange={() => chooseKind(k)}
                  disabled={busy !== null}
                />
                {IMPORT_KINDS[k].label}
              </span>
              <span className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                {IMPORT_KINDS[k].description}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* 2 · Datei */}
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-8 transition-[background-color,border-color] motion-reduce:transition-none",
          table
            ? "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
            : "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)]"
        )}
      >
        {busy === "read" ? (
          <Loader2
            size={24}
            className="animate-spin text-[color:var(--ds-info-text)]"
            aria-hidden
          />
        ) : (
          <UploadCloud size={24} className="text-[color:var(--ds-info-text)]" aria-hidden />
        )}
        <span className="text-sm text-[color:var(--ds-text)]">
          {fileName || "Datei wählen (CSV oder Excel .xlsx)"}
        </span>
        {table && (
          <span className="text-xs text-[color:var(--ds-text-muted)]">
            {table.rows.length} Zeilen
            {table.encoding === "windows-1252" && " · als Windows-1252 gelesen (Umlaute geprüft)"}
            {table.encoding === "xlsx" && " · erstes Tabellenblatt"}
          </span>
        )}
        <input
          id="import-file"
          type="file"
          accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </label>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
        >
          {error}
        </div>
      )}

      {table && (
        <>
          {/* 3 · Spalten */}
          <section className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              Spalten zuordnen: {def.label}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {def.fields.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <label
                    htmlFor={`map-${f.key}`}
                    className="w-44 shrink-0 text-xs text-[color:var(--ds-text-muted)]"
                  >
                    {f.label}
                    {f.required && <span className="text-[color:var(--ds-danger-text)]"> *</span>}
                  </label>
                  <select
                    id={`map-${f.key}`}
                    value={mapping[f.key] ?? -1}
                    disabled={busy !== null}
                    onChange={(e) => {
                      setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }));
                      resetPlan();
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1.5 text-xs text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                  >
                    <option value={-1}>— nicht importieren —</option>
                    {table.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Spalte ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {missing.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-[color:var(--ds-warning-text)]">
                <AlertTriangle size={12} aria-hidden /> Noch zuordnen: {missing.join(", ")}
              </p>
            )}
            {kind === "deadlines" && (
              <label className="flex items-center gap-2 text-xs text-[color:var(--ds-text)]">
                <input
                  id="import-include-past"
                  type="checkbox"
                  checked={includePast}
                  onChange={(e) => {
                    setIncludePast(e.target.checked);
                    resetPlan();
                  }}
                />
                Auch Fristen vor dem heutigen Tag übernehmen
              </label>
            )}
            {kind === "time_entries" && (
              <label className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--ds-text)]">
                <span>Zeiten ohne Angabe „abgerechnet“ gelten als</span>
                <select
                  id="import-default-billed"
                  value={defaultBilled ? "billed" : "open"}
                  onChange={(e) => {
                    setDefaultBilled(e.target.value === "billed");
                    resetPlan();
                  }}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs"
                >
                  <option value="open">noch nicht abgerechnet</option>
                  <option value="billed">bereits abgerechnet</option>
                </select>
              </label>
            )}
            {kind === "deadlines" && (
              <p className="text-xs text-[color:var(--ds-warning-text)]">
                Übernommene Fristen sind nicht nachgerechnet. Sie erscheinen in der Fristenliste als
                „Ungeprüft“; unklare Notfrist-Angaben werden als Notfrist mit Vier-Augen-Kontrolle
                übernommen.
              </p>
            )}
          </section>

          {/* 4 · Probelauf */}
          <section className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
                <FlaskConical size={14} className="text-[color:var(--ds-info-text)]" aria-hidden />
                Probelauf
              </h2>
              <Button
                variant="secondary"
                className="gap-2 whitespace-nowrap"
                disabled={missing.length > 0 || busy !== null || table.rows.length === 0}
                onClick={() => void runDryRunStep()}
              >
                {busy === "plan" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FlaskConical size={14} />
                )}
                {busy === "plan" ? "Wird geprüft …" : "Probelauf starten"}
              </Button>
            </div>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              Liest die vorhandenen Daten und entscheidet für jede Zeile, ohne etwas zu speichern.
            </p>

            {plan && !outcome && (
              <>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Zeilen filtern">
                  {(["all", "create", "complete", "skip", "error"] as const).map((a) => {
                    const n = a === "all" ? plan.rows.length : plan.counts[a];
                    if (a !== "all" && n === 0) return null;
                    return (
                      <button
                        key={a}
                        type="button"
                        aria-pressed={filter === a}
                        onClick={() => setFilter(a)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs tabular-nums",
                          filter === a
                            ? "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-text)]"
                            : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]"
                        )}
                      >
                        {a === "all" ? "Alle" : ACTION_LABEL[a]} {n}
                      </button>
                    );
                  })}
                  {warningCount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-[color:var(--ds-warning-text)]">
                      <AlertTriangle size={12} aria-hidden /> {warningCount} mit Hinweis
                    </span>
                  )}
                </div>
                <PlanTable
                  rows={(shownRows ?? []).map((r) => ({
                    row: r.row,
                    label: r.label,
                    state: r.action,
                    stateLabel: ACTION_LABEL[r.action],
                    reason: r.reason,
                    warnings: r.warnings,
                  }))}
                  ariaLabel="Ergebnis des Probelaufs"
                />
              </>
            )}
          </section>

          {/* 5 · Import */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              className="gap-2 whitespace-nowrap"
              disabled={!plan || writable === 0 || busy !== null || Boolean(outcome)}
              onClick={() => void runImport()}
            >
              {busy === "import" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ArrowRight size={16} />
              )}
              {busy === "import"
                ? `Wird importiert … ${progress} %`
                : plan
                  ? `${writable} ${writable === 1 ? "Eintrag" : "Einträge"} importieren`
                  : "Importieren"}
            </Button>
            {!plan && (
              <span className="text-xs text-[color:var(--ds-text-muted)]">
                Zuerst den Probelauf starten.
              </span>
            )}
            {plan && writable === 0 && !outcome && (
              <span className="text-xs text-[color:var(--ds-text-muted)]">
                Der Probelauf hat nichts zu importieren gefunden.
              </span>
            )}
          </div>

          {outcome && (
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
                <span className="text-[color:var(--ds-success-text)]">
                  {outcome.counts.imported} importiert
                </span>
                {outcome.counts.completed > 0 && <span>{outcome.counts.completed} ergänzt</span>}
                {outcome.counts.skipped > 0 && <span>{outcome.counts.skipped} übersprungen</span>}
                {outcome.counts.failed > 0 && (
                  <span className="text-[color:var(--ds-danger-text)]">
                    {outcome.counts.failed} fehlgeschlagen
                  </span>
                )}
              </p>
              <PlanTable
                rows={outcome.rows
                  .filter((r) => r.status !== "imported" || r.warnings.length > 0)
                  .map((r) => ({
                    row: r.row,
                    label: r.label,
                    state: r.status,
                    stateLabel: STATUS_LABEL[r.status],
                    reason: r.reason,
                    warnings: r.warnings,
                  }))}
                ariaLabel="Zeilen mit Hinweis"
              />
              {project && (outcome.counts.imported > 0 || outcome.counts.completed > 0) && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-2"
                  disabled={busy !== null}
                  onClick={() =>
                    void takeBack({
                      slug: `legal/migration-projects/${project.id}`,
                      refs: outcome.refs,
                      project,
                      kind,
                    }).then((done) => done && setOutcome(null))
                  }
                >
                  <RotateCcw size={14} aria-hidden />
                  Diesen Import zurücknehmen
                </Button>
              )}
            </section>
          )}
        </>
      )}

      {rollback && (
        <div
          role="status"
          className="space-y-1 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-sm"
        >
          <p className="font-medium text-[color:var(--ds-text)]">
            Zurückgenommen. {describeRollback(rollback)}
          </p>
          {rollback.kept.map((k) => (
            <p key={k} className="text-xs text-[color:var(--ds-text-muted)]">
              Behalten: {k}
            </p>
          ))}
          {rollback.failed.map((f) => (
            <p key={f} className="text-xs text-[color:var(--ds-danger-text)]">
              Nicht zurückgenommen: {f}
            </p>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
            <History size={14} aria-hidden /> Letzte Importe
          </h2>
          <ul className="divide-y divide-[color:var(--ds-border)] rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            {history.map((h) => (
              <li key={h.slug} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-xs">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-[color:var(--ds-text)]">
                    {IMPORT_KINDS[h.kind].label}
                  </span>{" "}
                  <span className="text-[color:var(--ds-text-muted)]">
                    · {h.project.name} ·{" "}
                    <span className="tabular-nums">{formatDateTime(h.project.updated_at)}</span>
                    {h.counts &&
                      ` · ${h.counts.imported} importiert${h.counts.completed ? `, ${h.counts.completed} ergänzt` : ""}`}
                  </span>
                </span>
                {h.rolledBackAt ? (
                  <span className="text-[color:var(--ds-text-muted)]">zurückgenommen</span>
                ) : (
                  h.refs &&
                  (h.refs.pages.length > 0 ||
                    h.refs.contactCompletions.length > 0 ||
                    h.refs.timeEntries.length > 0) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      disabled={busy !== null}
                      onClick={() => void takeBack({ ...h, refs: h.refs! })}
                    >
                      <RotateCcw size={12} aria-hidden /> Zurücknehmen
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PlanTable({
  rows,
  ariaLabel,
}: {
  rows: Array<{
    row: number;
    label: string;
    state: PlanAction | RowStatus;
    stateLabel: string;
    reason?: string;
    warnings: string[];
  }>;
  ariaLabel: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-[color:var(--ds-border)]">
      <table className="w-full text-xs" aria-label={ariaLabel}>
        <thead className="sticky top-0 bg-[color:var(--ds-surface)]">
          <tr className="text-left text-[color:var(--ds-text-muted)]">
            <th scope="col" className="px-3 py-2 font-medium">
              Zeile
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Eintrag
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Ergebnis
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Grund / Hinweis
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.row} className="border-t border-[color:var(--ds-border)] align-top">
              <td className="px-3 py-1.5 tabular-nums">{r.row}</td>
              <td className="max-w-[280px] px-3 py-1.5 break-words">{r.label}</td>
              <td className={cn("px-3 py-1.5 whitespace-nowrap", TONE[r.state])}>{r.stateLabel}</td>
              <td className="px-3 py-1.5">
                {r.reason && <span>{r.reason}</span>}
                {r.warnings.map((w) => (
                  <span key={w} className="block text-[color:var(--ds-warning-text)]">
                    {w}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
