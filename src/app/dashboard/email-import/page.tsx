"use client";

import { useState, useCallback } from "react";
import { Upload, Link, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseEml, type ParsedEmail } from "@/lib/email-parser";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";

interface ImportResult {
  success: boolean;
  duplicate?: boolean;
  matchedCase?: { slug: string; caseNumber?: string; title: string };
  suggestions?: Array<{ slug: string; caseNumber?: string; title: string }>;
  message?: string;
}

export default function EmailImportPage() {
  const { t } = useLang();
  const [parsed, setParsed] = useState<ParsedEmail[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<Record<number, ImportResult>>({});
  const [importError, setImportError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const results: ParsedEmail[] = [];
    for (const file of acceptedFiles) {
      const text = await file.text();
      results.push(parseEml(text));
    }
    setParsed(results);
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
        });
        next[i] = res;
      } catch (err) {
        setImportError(err instanceof Error ? err.message : t("email_import.error_failed"));
      }
    }
    setResults(next);
    setImporting(false);
  }

  const matchedCount = Object.values(results).filter((r) => r.success && !r.duplicate).length;
  const unmatchedCount = Object.values(results).filter((r) => !r.success).length;

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("email_import.title")}
        description={t("email_import.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("email_import.breadcrumb") },
        ]}
      />

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files).filter(
            (f) => f.name.endsWith(".eml") || f.name.endsWith(".msg")
          );
          void onDrop(files);
        }}
        className="cursor-pointer rounded-xl border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-8 text-center transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-blue-500/30 hover:bg-blue-500/[0.02]"
        onClick={() => document.getElementById("email-file-input")?.click()}
      >
        <Upload size={32} className="mx-auto mb-3 text-[color:var(--ds-border)]" />
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
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
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
              variant="primary"
              className="gap-2 bg-blue-600 text-sm text-white hover:bg-blue-500"
              onClick={importEmails}
              disabled={importing}
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Link size={14} />}
              {importing ? t("email_import.importing") : t("email_import.assign")}
            </Button>
          </div>

          {Object.keys(results).length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm">
              <CheckCircle2 size={14} className="mr-1 inline text-emerald-600" />
              {matchedCount} {t("email_import.matched")}
              {unmatchedCount > 0 && (
                <span className="ml-2 text-amber-700">
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
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-600">
                        {t("email_import.confidence_high")}
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600">
                        {t("email_import.confidence_low")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {email.fromName} &lt;{email.from}&gt; · {email.date}
                  </div>
                  {email.attachments.length > 0 && (
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {email.attachments.length} {t("email_import.attachments")}
                    </div>
                  )}

                  {!result && email.suggestedCaseSlug && (
                    <div className="flex items-center gap-1 text-xs text-blue-600">
                      <Link size={12} />
                      {t("email_import.suggested")} {email.suggestedCaseSlug}
                    </div>
                  )}

                  {result?.success && result.matchedCase && (
                    <div className="flex items-center gap-1 text-xs text-emerald-600">
                      <Link size={12} />
                      {result.duplicate
                        ? t("email_import.assigned_dup") + " "
                        : t("email_import.assigned_to") + " "}
                      {result.matchedCase.caseNumber ?? result.matchedCase.slug} —{" "}
                      {result.matchedCase.title}
                    </div>
                  )}

                  {result && !result.success && (
                    <div className="space-y-1 text-xs text-amber-700">
                      <div className="flex items-center gap-1">
                        <AlertTriangle size={12} />
                        {result.message ?? t("email_import.no_match")}
                      </div>
                      {result.suggestions && result.suggestions.length > 0 && (
                        <div className="text-[color:var(--ds-text-muted)]">
                          {t("email_import.possible")}{" "}
                          {result.suggestions
                            .map((s) => `${s.caseNumber ?? s.slug} (${s.title})`)
                            .join(", ")}
                        </div>
                      )}
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
