"use client";

import { useState, useCallback } from "react";
import { Upload, Link, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseEml, type ParsedEmail } from "@/lib/email-parser";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/page-header";

export default function EmailImportPage() {
  const [parsed, setParsed] = useState<ParsedEmail[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const results: ParsedEmail[] = [];
    for (const file of acceptedFiles) {
      const text = await file.text();
      results.push(parseEml(text));
    }
    setParsed(results);
  }, []);

  async function importEmails() {
    setImporting(true);
    setImportError(null);
    let count = 0;
    for (const email of parsed) {
      try {
        const res = await api.email.import({
          subject: email.subject,
          from: email.from,
          body: email.body,
          date: email.date,
        });
        if (res.success && !res.duplicate) count++;
      } catch (err) {
        setImportError(err instanceof Error ? err.message : "Import fehlgeschlagen.");
      }
    }
    setImported(count);
    setImporting(false);
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="E-Mail-Import"
        description="Mandanten-E-Mails automatisch Akten zuordnen"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "E-Mail-Import" }]}
      />

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith(".eml") || f.name.endsWith(".msg"));
          void onDrop(files);
        }}
        className="rounded-xl border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-8 text-center hover:border-blue-500/30 hover:bg-blue-500/[0.02] transition-all duration-300 cursor-pointer"
        onClick={() => document.getElementById("email-file-input")?.click()}
      >
        <Upload size={32} className="mx-auto text-[color:var(--ds-border)] mb-3" />
        <p className="text-sm text-[color:var(--ds-text-muted)]">.eml-Dateien hierher ziehen oder klicken</p>
        <input
          id="email-file-input"
          type="file"
          multiple
          accept=".eml"
          className="hidden"
          onChange={(e) => { const files = Array.from(e.target.files || []); void onDrop(files); }}
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
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">{parsed.length} E-Mail(s) erkannt</h2>
            <Button
              variant="primary"
              className="bg-blue-600 hover:bg-blue-500 text-white gap-2 text-sm"
              onClick={importEmails}
              disabled={importing}
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Link size={14} />}
              {importing ? "Importiere…" : "Akten zuordnen"}
            </Button>
          </div>

          {imported > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 size={14} className="inline mr-1" />
              {imported} E-Mail(s) erfolgreich zugeordnet.
            </div>
          )}

          <div className="space-y-2">
            {parsed.map((email, i) => (
              <div key={i} className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[color:var(--ds-text)] truncate">{email.subject}</span>
                  {email.confidence === "high" ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-600">Hoch</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-600">Unsicher</span>
                  )}
                </div>
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {email.fromName} &lt;{email.from}&gt; · {email.date}
                </div>
                {email.suggestedCaseSlug && (
                  <div className="flex items-center gap-1 text-xs text-blue-600">
                    <Link size={12} />
                    Vorgeschlagene Akte: {email.suggestedCaseSlug}
                  </div>
                )}
                {email.attachments.length > 0 && (
                  <div className="text-xs text-[color:var(--ds-text-muted)]">{email.attachments.length} Anhänge</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
