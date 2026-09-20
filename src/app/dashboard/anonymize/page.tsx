"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { ShieldCheck, Loader2, Copy, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { AnonymizeResponse } from "@/lib/types";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

const TYPE_LABELS: Record<string, DashboardKey> = {
  person: "anonymize.type_person",
  organization: "anonymize.type_organization",
  email: "anonymize.type_email",
  phone: "anonymize.type_phone",
  aktenzeichen: "anonymize.type_aktenzeichen",
  address: "anonymize.type_address",
  credit_card: "anonymize.type_credit_card",
};

export default function AnonymizePage() {
  const { t } = useLang();
  const { addToast } = useToast();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<AnonymizeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.legal.anonymize(input);
      setResult(res);
      addToast({ type: "success", description: "Text anonymisiert" });
    } catch {
      setError(
        "Die Anonymisierung ist gerade nicht verfügbar. Bitte versuchen Sie es in einigen Minuten erneut."
      );
      addToast({ type: "error", description: t("anonymize.error") });
    } finally {
      setLoading(false);
    }
  }

  async function copyResult() {
    if (!result) return;
    await navigator.clipboard.writeText(result.anonymized);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("anonymize.title")}
        description={t("anonymize.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("anonymize.breadcrumb") },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Eingabe */}
        <div className="space-y-2">
          <label
            htmlFor="anonymize-input"
            className="text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase"
          >
            Original
          </label>
          <textarea
            id="anonymize-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("anonymize.placeholder_input")}
            className="h-80 w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 font-mono text-sm leading-relaxed text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          />
          <Button
            onClick={run}
            disabled={loading || !input.trim()}
            className="gap-2 whitespace-nowrap"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
            {t("anonymize.btn_run")}
          </Button>
        </div>

        {/* Ergebnis */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="anonymize-output"
              className="text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase"
            >
              Anonymisiert
            </label>
            {result && (
              <button
                onClick={copyResult}
                className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:underline"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Kopiert" : "Kopieren"}
              </button>
            )}
          </div>
          <textarea
            id="anonymize-output"
            readOnly
            value={result?.anonymized ?? ""}
            placeholder={t("anonymize.placeholder_output")}
            className="h-80 w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 font-mono text-sm leading-relaxed text-[color:var(--ds-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[color:var(--ds-text-muted)]">
              {result.count} {t("anonymize.stats_replacements")}:
            </span>
            {Object.entries(result.stats).map(([type, n]) => (
              <Badge key={type} variant="default" className="text-xs">
                {TYPE_LABELS[type] ? t(TYPE_LABELS[type]) : type}: {n}
              </Badge>
            ))}
            <Badge
              variant="default"
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-border)] text-xs text-[color:var(--ds-text-muted)]"
            >
              {result.llm_used ? "Namen mit KI erkannt" : "Namen nur über Muster erkannt"}
            </Badge>
          </div>

          {result.replacements.length > 0 && (
            <details className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
              <summary className="cursor-pointer px-4 py-3 text-sm text-[color:var(--ds-text)] select-none">
                Zuordnung Platzhalter → Original ({result.replacements.length}) — nur für
                Berechtigte
              </summary>
              <div className="max-h-72 overflow-y-auto px-4 pb-3">
                <table className="w-full text-xs">
                  <thead className="text-left text-[color:var(--ds-text-muted)]">
                    <tr>
                      <th className="py-1 pr-4">Platzhalter</th>
                      <th className="py-1">Original</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {result.replacements.map((r, i) => (
                      <tr key={i} className="border-t border-[color:var(--ds-border)]/60">
                        <td className="py-1 pr-4 whitespace-nowrap text-[color:var(--ds-text)]">
                          {r.placeholder}
                        </td>
                        <td className="py-1 break-all text-[color:var(--ds-text-muted)]">
                          {r.original}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <p className="text-xs text-[color:var(--ds-text-muted)]">{result.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
