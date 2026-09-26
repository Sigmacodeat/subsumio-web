"use client";

import { useState, useCallback, useEffect } from "react";
import { Upload, Link, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseEml, type ParsedEmail } from "@/lib/email-parser";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { formatDateTime } from "@/lib/utils";

interface ImportResult {
  success: boolean;
  duplicate?: boolean;
  error?: string;
  matchedCase?: { slug: string; caseNumber?: string; title: string };
  candidates?: Array<{ slug: string; caseNumber?: string; title: string }>;
  message?: string;
}

interface CaseOption {
  slug: string;
  title: string;
  caseNumber?: string;
}

export default function EmailImportPage() {
  const { t } = useLang();
  const [parsed, setParsed] = useState<ParsedEmail[]>([]);
  // The original messages: imported unchanged so no text or attachment is lost.
  const [raws, setRaws] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<Record<number, ImportResult>>({});
  const [importError, setImportError] = useState<string | null>(null);
  // Matters for the manual assignment of unmatched/ambiguous mails (loaded once).
  const [caseOptions, setCaseOptions] = useState<CaseOption[] | null>(null);
  const [chosen, setChosen] = useState<Record<number, string>>({});
  const [assigning, setAssigning] = useState<number | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const results: ParsedEmail[] = [];
    const originals: string[] = [];
    for (const file of acceptedFiles) {
      const text = await file.text();
      results.push(parseEml(text));
      originals.push(text);
    }
    setParsed(results);
    setRaws(originals);
    setResults({});
  }, []);

  async function importEmails() {
    setImporting(true);
    setImportError(null);
    const next: Record<number, ImportResult> = {};
    for (let i = 0; i < parsed.length; i++) {
      const email = parsed[i];
      try {
        const res = await api.email.import({
          subject: email.subject,
          from: email.from,
          body: email.body,
          date: email.date,
          raw_eml: raws[i],
        });
        next[i] = res;
      } catch {
        // Keep the batch going; the row shows its own failure, the banner a plain summary.
        next[i] = { success: false };
        setImportError(t("email_import.error_failed"));
      }
    }
    setResults(next);
    setImporting(false);
  }

  const needsChoice = Object.values(results).some((r) => !r.success);
  useEffect(() => {
    if (!needsChoice || caseOptions !== null) return;
    let cancelled = false;
    api.brain
      .listAllPages({ type: "legal_case" })
      .then((pages) => {
        if (cancelled) return;
        setCaseOptions(
          pages
            .filter((p) => {
              const st = (p.frontmatter as Record<string, unknown> | undefined)?.status;
              return st !== "archived" && st !== "tombstoned";
            })
            .map((p) => {
              const cn = (p.frontmatter as Record<string, unknown> | undefined)?.case_number;
              return {
                slug: p.slug,
                title: p.title ?? p.slug,
                caseNumber: typeof cn === "string" ? cn : undefined,
              };
            })
        );
      })
      .catch(() => {
        if (!cancelled) setCaseOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [needsChoice, caseOptions]);

  // Explicit choice by the user: the server files the mail into exactly this
  // matter (force_case_slug), no automatic matching.
  async function assignTo(i: number, caseSlug: string) {
    const email = parsed[i];
    if (!email || !caseSlug) return;
    setAssigning(i);
    try {
      const res = await api.email.import({
        subject: email.subject,
        from: email.from,
        body: email.body,
        date: email.date,
        raw_eml: raws[i],
        force_case_slug: caseSlug,
      });
      setResults((prev) => ({ ...prev, [i]: res }));
    } catch {
      setResults((prev) => ({
        ...prev,
        [i]: { ...prev[i], success: false, message: t("email_import.error_failed") },
      }));
    } finally {
      setAssigning(null);
    }
  }

  const matchedCount = Object.values(results).filter((r) => r.success && !r.duplicate).length;
  const unmatchedCount = Object.values(results).filter((r) => !r.success).length;

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("email_import.title")}
        description={t("email_import.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("email_import.breadcrumb") },
        ]}
      />

      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files).filter(
            // Only RFC-822 .eml can be parsed in the browser (Outlook .msg is binary).
            (f) => f.name.toLowerCase().endsWith(".eml")
          );
          void onDrop(files);
        }}
        className="cursor-pointer rounded-xl border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-8 text-center transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
        onClick={() => document.getElementById("email-file-input")?.click()}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            document.getElementById("email-file-input")?.click();
          }
        }}
      >
        <Upload
          size={32}
          className="mx-auto mb-3 text-[color:var(--ds-text-subtle)]"
          aria-hidden="true"
        />
        <p className="text-sm text-[color:var(--ds-text-muted)]">{t("email_import.drop_text")}</p>
        <input
          id="email-file-input"
          type="file"
          multiple
          accept=".eml"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            void onDrop(files);
          }}
        />
      </div>

      {importError && (
        <div className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          {importError}
        </div>
      )}

      {parsed.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {parsed.length} {t("email_import.recognized")}
            </h2>
            <Button
              size="sm"
              className="gap-1.5 whitespace-nowrap"
              onClick={importEmails}
              disabled={importing}
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Link size={14} />}
              {importing ? t("email_import.importing") : t("email_import.assign")}
            </Button>
          </div>

          {Object.keys(results).length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm">
              <CheckCircle2 size={14} className="mr-1 inline text-[color:var(--ds-success-text)]" />
              {matchedCount} {t("email_import.matched")}
              {unmatchedCount > 0 && (
                <span className="ml-2 text-[color:var(--ds-warning-text)]">
                  <AlertTriangle size={14} className="mr-1 inline" />
                  {unmatchedCount} {t("email_import.unmatched")}
                </span>
              )}
            </div>
          )}

          <div className="space-y-2">
            {parsed.map((email, i) => {
              const result = results[i];
              return (
                <div
                  key={i}
                  className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {email.subject}
                    </span>
                    {email.confidence === "high" ? (
                      <span className="rounded-full border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-1.5 py-0.5 text-xs text-[color:var(--ds-success-text)]">
                        Zuordnung: {t("email_import.confidence_high")}
                      </span>
                    ) : (
                      <span className="rounded-full border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-1.5 py-0.5 text-xs text-[color:var(--ds-warning-text)]">
                        Zuordnung: {t("email_import.confidence_low")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {email.fromName ? `${email.fromName} <${email.from}>` : email.from}
                    {email.date &&
                      ` · ${formatDateTime(email.date) === "—" ? email.date : formatDateTime(email.date)}`}
                  </div>
                  {email.attachments.length > 0 && (
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {email.attachments.length} {t("email_import.attachments")} — werden mit der
                      Original-E-Mail in der Akte abgelegt
                    </div>
                  )}

                  {!result && email.aktenzeichen && (
                    <div className="flex items-center gap-1 text-xs text-[color:var(--ds-info-text)]">
                      <Link size={12} />
                      Erkannte Geschäftszahl: {email.aktenzeichen}
                    </div>
                  )}

                  {result?.success && result.matchedCase && (
                    <div className="flex items-center gap-1 text-xs text-[color:var(--ds-success-text)]">
                      <Link size={12} />
                      {result.duplicate
                        ? t("email_import.assigned_dup") + " "
                        : t("email_import.assigned_to") + " "}
                      {result.matchedCase.caseNumber ?? result.matchedCase.slug} —{" "}
                      {result.matchedCase.title}
                    </div>
                  )}

                  {result && !result.success && (
                    <div className="space-y-1 text-xs text-[color:var(--ds-warning-text)]">
                      <div className="flex items-center gap-1">
                        <AlertTriangle size={12} />
                        {result.message ?? t("email_import.no_match")}
                      </div>
                      {result.candidates && result.candidates.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[color:var(--ds-text-muted)]">
                          <span>{t("email_import.possible")}</span>
                          {result.candidates.map((c) => (
                            <Button
                              key={c.slug}
                              size="sm"
                              variant="outline"
                              disabled={assigning === i}
                              onClick={() => void assignTo(i, c.slug)}
                            >
                              {c.caseNumber ? `${c.caseNumber} — ${c.title}` : c.title}
                            </Button>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-[color:var(--ds-text-muted)]">
                        <select
                          aria-label={`Akte für „${email.subject}“ wählen`}
                          value={chosen[i] ?? ""}
                          onChange={(e) => setChosen((prev) => ({ ...prev, [i]: e.target.value }))}
                          className="max-w-full rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                        >
                          <option value="">
                            {caseOptions === null
                              ? "Akten werden geladen …"
                              : "Andere Akte wählen …"}
                          </option>
                          {(caseOptions ?? []).map((c) => (
                            <option key={c.slug} value={c.slug}>
                              {c.caseNumber ? `${c.caseNumber} — ${c.title}` : c.title}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          disabled={!chosen[i] || assigning === i}
                          loading={assigning === i}
                          onClick={() => void assignTo(i, chosen[i] ?? "")}
                        >
                          Zuordnen
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
