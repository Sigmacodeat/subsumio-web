"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Radar, CheckCircle2, XCircle, Loader2, Info } from "lucide-react";

/**
 * RCIID (Krypto-Forensik) — Verbindungsstatus.
 *
 * Zugangsdaten (RCIID_API_KEY, RCIID_WEBHOOK_SECRET) werden vom Betreiber in der
 * Serverumgebung hinterlegt; diese Seite kann sie weder lesen noch speichern. Sie zeigt
 * deshalb nur den Status und erlaubt einen Verbindungstest — keine Eingabefelder, die
 * ein Speichern vortäuschen.
 */
export default function RciidSettingsPage() {
  const { t, lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);

  const [status, setStatus] = useState<"checking" | "connected" | "missing">("checking");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"none" | "success" | "fail">("none");

  useEffect(() => {
    api.rciid
      .listCases({ limit: 1 })
      .then(() => setStatus("connected"))
      .catch(() => setStatus("missing"));
  }, []);

  async function handleTest() {
    setTesting(true);
    setTestResult("none");
    try {
      await api.rciid.listCases({ limit: 1 });
      setTestResult("success");
      setStatus("connected");
    } catch {
      setTestResult("fail");
      setStatus("missing");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[720px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={L("Krypto-Forensik (RCIID)", "Crypto forensics (RCIID)")}
        description={L(
          "Verbindung zum Forensik-Dienst RCIID, der Krypto-Wallets in Akten analysiert.",
          "Connection to the RCIID forensics service, which analyses crypto wallets in matters."
        )}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("settings.title"), href: "/dashboard/settings" },
          { label: "RCIID" },
        ]}
      />

      <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6">
        <div className="flex items-center gap-2">
          <Radar size={18} className="text-[color:var(--ds-text-muted)]" aria-hidden />
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {L("Verbindungsstatus", "Connection status")}
          </h2>
          {status === "checking" ? (
            <Skeleton className="h-5 w-24" />
          ) : status === "connected" ? (
            <Badge variant="success" className="text-xs">
              {L("Verbunden", "Connected")}
            </Badge>
          ) : (
            <Badge variant="warning" className="text-xs">
              {L("Nicht eingerichtet", "Not set up")}
            </Badge>
          )}
        </div>

        <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
          {status === "missing"
            ? L(
                "Der Zugang zu RCIID ist noch nicht hinterlegt. Die Zugangsdaten werden aus Sicherheitsgründen nicht im Browser, sondern vom Betreiber Ihrer Subsumio-Installation eingetragen. Wenden Sie sich dazu an Ihren Ansprechpartner.",
                "RCIID access has not been set up yet. For security reasons the credentials are entered by the operator of your Subsumio installation, not in the browser. Please contact your administrator."
              )
            : L(
                "Subsumio kann Krypto-Wallets aus Ihren Akten an RCIID übergeben und die Analyse in der Akte anzeigen.",
                "Subsumio can pass crypto wallets from your matters to RCIID and show the analysis in the matter."
              )}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
            {testing && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {t("crypto_forensics.settings_test_connection")}
          </Button>
          {testResult === "success" && (
            <span
              role="status"
              className="flex items-center gap-1.5 text-sm text-[color:var(--ds-success-text)]"
            >
              <CheckCircle2 size={14} aria-hidden />
              {L("Verbindung funktioniert.", "Connection works.")}
            </span>
          )}
          {testResult === "fail" && (
            <span
              role="alert"
              className="flex items-center gap-1.5 text-sm text-[color:var(--ds-danger-text)]"
            >
              <XCircle size={14} aria-hidden />
              {L(
                "RCIID ist nicht erreichbar oder der Zugang fehlt.",
                "RCIID is unreachable or access is missing."
              )}
            </span>
          )}
        </div>
      </section>

      <section className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
        <Info size={16} className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]" aria-hidden />
        <div className="space-y-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
          <p className="text-sm font-medium text-[color:var(--ds-text)]">
            {L("Abrechnung der Analysen", "Billing of analyses")}
          </p>
          <p>
            {L(
              "Kosten einer RCIID-Analyse erfassen Sie in der Akte als Barauslage. Eine automatische Weiterverrechnung ist derzeit nicht eingerichtet.",
              "Record the cost of an RCIID analysis in the matter as a disbursement. Automatic re-billing is not set up at present."
            )}
          </p>
        </div>
      </section>
    </div>
  );
}
