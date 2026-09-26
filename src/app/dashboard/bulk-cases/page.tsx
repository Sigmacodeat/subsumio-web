"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/csrf";
import {
  bulkImportFailureMessage,
  parseCsvCaseRows,
  type BulkImportResult,
  type BulkRowStatus,
} from "@/lib/bulk-cases";
import { useLang } from "@/lib/use-lang";
import { encodeSlugPath, formatEur } from "@/lib/utils";
import type { DashboardKey } from "@/content/dashboard";

// German column names are accepted as aliases (see parseCsvCases).
const SAMPLE =
  "aktenzeichen,mandant,email,gegner,gegenstand,rechtsgebiet,gericht,streitwert,klammer\n" +
  "2026-001,Max Mustermann,max@example.at,Gegner GmbH,Forderung,Zivilrecht,BG Innere Stadt Wien,10000,PORTFOLIO-1";

const STATUS_LABEL: Record<BulkRowStatus, { de: string; en: string }> = {
  created: { de: "Angelegt", en: "Created" },
  exists: { de: "Übersprungen — besteht bereits", en: "Skipped — already exists" },
  conflict: { de: "Kollision — nicht angelegt", en: "Conflict — not created" },
  error: { de: "Fehler — nicht angelegt", en: "Error — not created" },
};

export default function BulkCasesPage() {
  const { t, lang } = useLang();
  const en = lang === "en";
  const tr = (key: string) => t(key as DashboardKey);
  const [error, setError] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const parsed = useMemo(() => parseCsvCaseRows(csv), [csv]);
  const preview = parsed.rows;
  const skipped = parsed.invalid.length;

  async function submit() {
    setSubmitting(true);
    setResult(null);
    setError(null);
    try {
      const r = await csrfFetch("/api/bulk-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv_text: csv }),
      });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.data) {
        setResult(j.data as BulkImportResult);
      } else {
        const code = typeof j?.code === "string" ? j.code : undefined;
        setError(bulkImportFailureMessage(r.status, code, en));
      }
    } catch {
      // The connection may drop while the server is still writing rows.
      setError(bulkImportFailureMessage(0, undefined, en));
    } finally {
      setSubmitting(false);
    }
  }

  const rowsLabel = (n: number) =>
    en ? `${n} ${n === 1 ? "case" : "cases"}` : `${n} ${n === 1 ? "Akte" : "Akten"}`;

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={tr("workspace.bulk.title")}
        description={
          en
            ? "Paste CSV data, check the preview and create many cases at once — grouped under one mandate."
            : "CSV-Daten einfügen, Vorschau prüfen und viele Akten auf einmal anlegen — gebündelt unter einer Klammer."
        }
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("cases.title"), href: "/dashboard/cases" },
          { label: tr("workspace.bulk.title") },
        ]}
      />

      <section className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
            {tr("workspace.bulk.import")}
          </h2>
          {!csv && (
            <Button variant="ghost" size="sm" onClick={() => setCsv(SAMPLE)}>
              {en ? "Insert example" : "Beispiel einfügen"}
            </Button>
          )}
        </div>
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          {en
            ? "Required columns: aktenzeichen, mandant, gegenstand, klammer. Optional: email, gegner, rechtsgebiet, gericht, streitwert. Separator: comma or semicolon. Existing case numbers are skipped, never overwritten."
            : "Pflichtspalten: aktenzeichen, mandant, gegenstand, klammer. Optional: email, gegner, rechtsgebiet, gericht, streitwert (z. B. 10.000,50). Trennzeichen: Komma oder Semikolon. Bestehende Aktenzeichen werden übersprungen, nie überschrieben."}
        </p>
        <textarea
          aria-label={tr("workspace.bulk.csv_label")}
          placeholder={SAMPLE}
          className="min-h-48 w-full rounded-lg border border-[color:var(--ds-border)] bg-transparent p-3 font-mono text-xs text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setResult(null);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void submit()}
            disabled={!preview.length || submitting}
            loading={submitting}
            className="whitespace-nowrap"
          >
            {en ? `Create ${rowsLabel(preview.length)}` : `${rowsLabel(preview.length)} anlegen`}
          </Button>
          {skipped > 0 && (
            <span className="text-xs text-[color:var(--ds-warning-text)]">
              {en
                ? `${skipped} ${skipped === 1 ? "row is" : "rows are"} incomplete or invalid and will not be imported.`
                : `${skipped} ${skipped === 1 ? "Zeile ist" : "Zeilen sind"} unvollständig oder fehlerhaft und ${skipped === 1 ? "wird" : "werden"} nicht importiert.`}
            </span>
          )}
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-4 text-sm text-[color:var(--ds-danger-text)]"
        >
          {error}
        </div>
      )}

      {result && (
        <div
          role="status"
          className={`rounded-xl border p-4 text-sm ${
            result.created === result.total
              ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
              : "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
          }`}
        >
          {en
            ? `${result.created} of ${result.total} cases created.`
            : `${result.created} von ${result.total} Akten angelegt.`}
          {result.exists > 0 &&
            (en
              ? ` ${result.exists} skipped (already exist, left unchanged).`
              : ` ${result.exists} übersprungen (bestehen bereits, unverändert).`)}
          {result.conflicts > 0 &&
            (en
              ? ` ${result.conflicts} stopped by the conflict check.`
              : ` ${result.conflicts} wegen Kollisionsprüfung nicht angelegt.`)}
          {result.errors > 0 &&
            (en
              ? ` ${result.errors} could not be created.`
              : ` ${result.errors} konnten nicht angelegt werden.`)}{" "}
          <Link href="/dashboard/cases" className="font-medium underline">
            {en ? "Open case register" : "Zum Aktenregister"}
          </Link>
          {result.results.some((r) => r.status !== "created") && (
            <ul className="mt-3 space-y-1 text-xs">
              {result.results
                .filter((r) => r.status !== "created")
                .map((r) => (
                  <li key={r.line}>
                    {en ? "Line" : "Zeile"} {r.line}
                    {r.case_number ? ` (${r.case_number})` : ""}:{" "}
                    {STATUS_LABEL[r.status][en ? "en" : "de"]}
                    {r.error ? ` — ${r.error}` : ""}
                    {r.conflicts?.length ? ` (${r.conflicts.join(", ")})` : ""}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
          {tr("workspace.bulk.preview")}
        </h2>
        {preview.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title={en ? "No valid rows yet" : "Noch keine gültigen Zeilen"}
            description={
              en
                ? "Paste CSV data with a header row above — the preview shows every case that will be created."
                : "Fügen Sie oben CSV-Daten mit Kopfzeile ein — die Vorschau zeigt jede Akte, die angelegt wird."
            }
            actionLabel={en ? "Insert example" : "Beispiel einfügen"}
            onAction={() => setCsv(SAMPLE)}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[color:var(--ds-surface-2)] text-[0.6875rem] font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                <tr>
                  <th className="px-3 py-2 whitespace-nowrap">{tr("workspace.bulk.case")}</th>
                  <th className="px-3 py-2">{tr("workspace.bulk.client")}</th>
                  <th className="px-3 py-2">{tr("workspace.bulk.matter")}</th>
                  <th className="hidden px-3 py-2 md:table-cell">{en ? "Opponent" : "Gegner"}</th>
                  <th className="hidden px-3 py-2 text-right lg:table-cell">
                    {en ? "Value in dispute" : "Streitwert"}
                  </th>
                  <th className="px-3 py-2">{en ? "Mandate" : "Klammer"}</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(({ line, row: r }) => {
                  const rowResult = result?.results.find((x) => x.line === line);
                  const linkSlug = rowResult?.status === "created" ? rowResult.slug : undefined;
                  return (
                    <tr key={line} className="border-t border-[color:var(--ds-border)]">
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap tabular-nums">
                        {linkSlug ? (
                          <Link
                            href={`/dashboard/cases/${encodeSlugPath(linkSlug)}`}
                            className="brand-text hover:underline"
                          >
                            {r.case_number}
                          </Link>
                        ) : (
                          r.case_number
                        )}
                        {rowResult && rowResult.status !== "created" && (
                          <span className="ml-2 font-sans text-[color:var(--ds-warning-text)]">
                            {STATUS_LABEL[rowResult.status][en ? "en" : "de"]}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{r.client_name}</td>
                      <td className="px-3 py-2">{r.matter}</td>
                      <td className="hidden px-3 py-2 text-[color:var(--ds-text-muted)] md:table-cell">
                        {r.opponent_name || "—"}
                      </td>
                      <td className="hidden px-3 py-2 text-right tabular-nums lg:table-cell">
                        {typeof r.dispute_value === "number" && Number.isFinite(r.dispute_value)
                          ? formatEur(r.dispute_value, lang)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.mandate_id}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
