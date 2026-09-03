"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Scale, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLang } from "@/lib/use-lang";
import { useMatterData } from "@/lib/matter-data-context";
import { api } from "@/lib/api";

export default function InvestigationLauncherPage() {
  const router = useRouter();
  const { lang } = useLang();
  const { caseSlug } = useMatterData();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startInvestigation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.legal.caseInvestigation({
        case_slug: caseSlug,
        pruefauftrag:
          lang === "en"
            ? "Identify contradictions between party claims and documentary evidence"
            : "Widersprüche zwischen Parteiaussagen und Dokumenten identifizieren",
        jurisdiction: "at",
      });
      router.push(
        `/dashboard/cases/${encodeURIComponent(caseSlug)}/investigation/${encodeURIComponent(result.run_id)}`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : lang === "en"
            ? "Investigation could not be started."
            : "Sachverhaltsprüfung konnte nicht gestartet werden."
      );
      setLoading(false);
    }
  }, [caseSlug, lang, router]);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <Scale className="h-6 w-6 text-[color:var(--brand-primary)]" />
        <h1 className="text-xl font-semibold text-[color:var(--ds-text)]">
          {lang === "en" ? "Case Investigation" : "Sachverhaltsprüfung"}
        </h1>
      </div>

      <Card className="p-6">
        <p className="mb-6 text-sm text-[color:var(--ds-text-muted)]">
          {lang === "en"
            ? "Run a two-phase investigation: first extract fact claims per document, then analyse them for contradictions, evidence gaps, and neutral questions. Every claim is grounded with verbatim citations."
            : "Zweiphasige Prüfung durchführen: Zuerst werden Tatsachenbehauptungen pro Dokument extrahiert, dann auf Widersprüche, Beweislücken und neutrale Klärungsfragen analysiert. Jede Aussage wird mit wörtlichen Zitaten belegt."}
        </p>

        {error && (
          <div
            className="mb-4 flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-3 text-sm text-[color:var(--ds-danger-text)]"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <Button
          onClick={startInvestigation}
          disabled={loading}
          className="gap-2 bg-[color:var(--brand-primary)] text-white hover:bg-[color:var(--brand-primary-hover)]"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
          {lang === "en" ? "Start new investigation" : "Neue Sachverhaltsprüfung starten"}
        </Button>
      </Card>
    </div>
  );
}
