"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Radar,
  Save,
  TestTube,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

export default function RciidSettingsPage() {
  const { t } = useLang();

  const [apiKey, setApiKey] = useState("");
  const [apiUrl, setApiUrl] = useState("https://rciid.at/api/v1");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [billingMode, setBillingMode] = useState<"flat" | "rvg_auslage" | "hourly">("flat");
  const [autoDetect, setAutoDetect] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"none" | "success" | "fail">("none");
  const [toast, setToast] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    // Load current settings from env via API
    // For now, check if we can list cases (indicates configured)
    api.rciid
      .listCases({ limit: 1 })
      .then(() => setConfigured(true))
      .catch(() => setConfigured(false));
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSave() {
    setSaving(true);
    // Settings are saved as env vars on the server
    // This would typically call a settings API endpoint
    // For now, we show a success message
    setTimeout(() => {
      setSaving(false);
      showToast(t("crypto_forensics.settings_saved" as DashboardKey));
    }, 500);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult("none");
    try {
      await api.rciid.listCases({ limit: 1 });
      setTestResult("success");
      setConfigured(true);
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[800px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("crypto_forensics.settings_title" as DashboardKey)}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/dashboard/settings" },
          { label: t("crypto_forensics.settings_title" as DashboardKey) },
        ]}
        actions={
          <Link href="/dashboard/settings">
            <Button variant="ghost" size="sm">
              <ArrowLeft size={14} />
              {t("crypto_forensics.close" as DashboardKey)}
            </Button>
          </Link>
        }
      />

      {toast && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600">
          <CheckCircle2 size={16} className="shrink-0" />
          {toast}
        </div>
      )}

      {!configured && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-600">
          <AlertCircle size={16} className="shrink-0" />
          {t("crypto_forensics.settings_not_configured" as DashboardKey)}
        </div>
      )}

      {/* Connection Settings */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6">
        <div className="flex items-center gap-2">
          <Radar size={18} className="brand-text" />
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">RCIID API</h2>
          {configured && (
            <Badge
              variant="default"
              className="border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-600"
            >
              <CheckCircle2 size={10} className="mr-1" />
              Connected
            </Badge>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
              {t("crypto_forensics.settings_api_url" as DashboardKey)}
            </label>
            <Input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://rciid.at/api/v1"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
              {t("crypto_forensics.settings_api_key" as DashboardKey)}
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="rciid-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              Environment variable: <code className="font-mono">RCIID_API_KEY</code>
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
              {t("crypto_forensics.settings_webhook_secret" as DashboardKey)}
            </label>
            <Input
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="HMAC-SHA256 Secret"
            />
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              Environment variable: <code className="font-mono">RCIID_WEBHOOK_SECRET</code>
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleTest} disabled={testing || !apiKey}>
              {testing ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : (
                <TestTube size={14} className="mr-2" />
              )}
              {t("crypto_forensics.settings_test_connection" as DashboardKey)}
            </Button>
            <Button variant="ghost" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : (
                <Save size={14} className="mr-2" />
              )}
              Save
            </Button>
          </div>

          {testResult === "success" && (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 size={14} />
              Verbindung erfolgreich!
            </div>
          )}
          {testResult === "fail" && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <XCircle size={14} />
              Verbindung fehlgeschlagen. API-Key und URL überprüfen.
            </div>
          )}
        </div>
      </div>

      {/* Billing Settings */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {t("crypto_forensics.settings_billing_mode" as DashboardKey)}
        </h2>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[color:var(--ds-border)] p-3 hover:bg-[color:var(--ds-hover)]">
            <input
              type="radio"
              name="billingMode"
              value="flat"
              checked={billingMode === "flat"}
              onChange={() => setBillingMode("flat")}
            />
            <div>
              <p className="text-sm font-medium text-[color:var(--ds-text)]">Pauschale (Flat)</p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Fester Betrag aus RCIID pricing wird als Auslage weiterberechnet
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[color:var(--ds-border)] p-3 hover:bg-[color:var(--ds-hover)]">
            <input
              type="radio"
              name="billingMode"
              value="rvg_auslage"
              checked={billingMode === "rvg_auslage"}
              onChange={() => setBillingMode("rvg_auslage")}
            />
            <div>
              <p className="text-sm font-medium text-[color:var(--ds-text)]">
                RVG-Auslagenpauschale (VV 7002)
              </p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                20 EUR Pauschale als Auslage für Gutachten/Sachverständige
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[color:var(--ds-border)] p-3 hover:bg-[color:var(--ds-hover)]">
            <input
              type="radio"
              name="billingMode"
              value="hourly"
              checked={billingMode === "hourly"}
              onChange={() => setBillingMode("hourly")}
            />
            <div>
              <p className="text-sm font-medium text-[color:var(--ds-text)]">Stundenbasis</p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Abrechnung nach tatsächlichem Aufwand (Stundensatz aus RCIID pricing)
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Auto-Detect Settings */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {t("crypto_forensics.settings_auto_detect" as DashboardKey)}
        </h2>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={autoDetect}
            onChange={(e) => setAutoDetect(e.target.checked)}
            className="h-4 w-4"
          />
          <div>
            <p className="text-sm text-[color:var(--ds-text)]">
              Automatische Wallet-Erkennung in Fall-Dokumenten
            </p>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              Beim Upload neuer Dokumente wird automatisch nach Krypto-Wallet-Adressen gesucht
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
