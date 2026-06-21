"use client";

import { useState, useCallback } from "react";
import { Upload, Link, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseEml, type ParsedEmail } from "@/lib/email-parser";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/page-header";

interface ImportResult {
  success: boolean;
  duplicate?: boolean;
  matchedCase?: { slug: string; caseNumber?: string; title: string };
  suggestions?: Array<{ slug: string; caseNumber?: string; title: string }>;
  message?: string;
}

export default function EmailImportPage() {
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
        setImportError(err instanceof Error ? err.message : "Import fehlgeschlagen.");
      }
    }
    setResults(next);
    setImporting(false);
  }

  const matchedCount = Object.values(results).filter((r) => r.success && !r.duplicate).length;
  const unmatchedCount = Object.values(results).filter((r) => !r.success).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="E-Mail-Import"
        description="Mandanten-E-Mails automatisch Akten zuordnen"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "E-Mail-Import" }]}
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
        className="cursor-pointer rounded-xl border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-8 text-center transition-all duration-300 hover:border-blue-500/30 hover:bg-blue-500/[0.02]"
        onClick={() => document.getElementById("email-file-input")?.click()}
      >
        <Upload size={32} className="mx-auto mb-3 text-[color:var(--ds-border)]" />
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          .eml-Dateien hierher ziehen oder klicken
        </p>
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
              {parsed.length} E-Mail(s) erkannt
            </h2>
            <Button
              variant="primary"
              className="gap-2 bg-blue-600 text-sm text-white hover:bg-blue-500"
              onClick={importEmails}
              disabled={importing}
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Link size={14} />}
              {importing ? "Importiere…" : "Akten zuordnen"}
            </Button>
          </div>

          {Object.keys(results).length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm">
              <CheckCircle2 size={14} className="mr-1 inline text-emerald-600" />
              {matchedCount} E-Mail(s) erfolgreich zugeordnet.
              {unmatchedCount > 0 && (
                <span className="ml-2 text-amber-700">
                  <AlertTriangle size={14} className="mr-1 inline" />
                  {unmatchedCount} ohne automatischen Treffer — bitte unten prüfen.
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
                        Hoch
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600">
                        Unsicher
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {email.fromName} &lt;{email.from}&gt; · {email.date}
                  </div>
                  {email.attachments.length > 0 && (
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {email.attachments.length} Anhänge
                    </div>
                  )}

                  {!result && email.suggestedCaseSlug && (
                    <div className="flex items-center gap-1 text-xs text-blue-600">
                      <Link size={12} />
                      Vorgeschlagene Akte: {email.suggestedCaseSlug}
                    </div>
                  )}

                  {result?.success && result.matchedCase && (
                    <div className="flex items-center gap-1 text-xs text-emerald-600">
                      <Link size={12} />
                      {result.duplicate ? "Bereits in Akte: " : "Zugeordnet zu Akte: "}
                      {result.matchedCase.caseNumber ?? result.matchedCase.slug} —{" "}
                      {result.matchedCase.title}
                    </div>
                  )}

                  {result && !result.success && (
                    <div className="space-y-1 text-xs text-amber-700">
                      <div className="flex items-center gap-1">
                        <AlertTriangle size={12} />
                        {result.message ?? "Keine passende Akte gefunden."}
                      </div>
                      {result.suggestions && result.suggestions.length > 0 && (
                        <div className="text-[color:var(--ds-text-muted)]">
                          Mögliche Akten:{" "}
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
