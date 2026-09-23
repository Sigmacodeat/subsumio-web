"use client";

import { useState, useEffect } from "react";
import {
  QrCode,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  Shield,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMe, use2FASetup, use2FAVerify, use2FADisable, use2FAQrCode } from "@/lib/queries/auth";
import { loadKanzleiSettings } from "@/lib/kanzlei-settings";
import { PageHeader } from "@/components/dashboard/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/use-lang";

export default function SecuritySettingsPage() {
  const { t, lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);
  const [step, setStep] = useState<"idle" | "setup" | "verify">("idle");
  const [qrUrl, setQrUrl] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [orgRequires2FA, setOrgRequires2FA] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [ipAllowlist, setIpAllowlist] = useState<string[]>([]);
  const [ipAllowlistEnabled, setIpAllowlistEnabled] = useState(false);
  const [ipAllowlistNote, setIpAllowlistNote] = useState("");
  const [ipAllowlistLoading, setIpAllowlistLoading] = useState(true);
  // Installation-wide setting, visible to platform operators only.
  const [ipAllowlistAvailable, setIpAllowlistAvailable] = useState(false);

  const meQuery = useMe();
  const setupMutation = use2FASetup();
  const verifyMutation = use2FAVerify();
  const disableMutation = use2FADisable();

  const enabled = !!meQuery.data?.user?.twoFactorEnabled;
  const loading = meQuery.isLoading;

  useEffect(() => {
    // Middleware sends a must2fa session here with ?require2fa=1. While 2FA
    // is not set up, that session may not read the firm settings (every API
    // outside the setup flow answers 403), so the hint must not depend on it.
    if (new URLSearchParams(window.location.search).get("require2fa") === "1") {
      setOrgRequires2FA(true);
    }
    loadKanzleiSettings()
      .then((s) => setOrgRequires2FA((prev) => prev || (s.require2FA ?? false)))
      .catch((err) =>
        console.warn(
          "[security] Failed to load 2FA settings:",
          err instanceof Error ? err.message : err
        )
      );
  }, []);

  const isAdmin = meQuery.data?.user?.role === "admin";
  useEffect(() => {
    if (!isAdmin) {
      setIpAllowlistLoading(false);
      return;
    }
    fetch("/api/admin/ip-allowlist")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        // Operator-only route: firm admins get 403 and simply see no card.
        if (!data) {
          setIpAllowlistAvailable(false);
          return;
        }
        setIpAllowlistAvailable(true);
        const d = data.data ?? data;
        setIpAllowlist(d.entries ?? []);
        setIpAllowlistEnabled(d.enabled ?? false);
        setIpAllowlistNote(d.note ?? "");
      })
      .catch(() => {})
      .finally(() => setIpAllowlistLoading(false));
  }, [isAdmin]);

  async function startSetup() {
    setError(null);
    try {
      const data = await setupMutation.mutateAsync();
      setQrUrl(data.qrData);
      setStep("setup");
    } catch {
      setError(
        L(
          "Die Einrichtung konnte nicht gestartet werden. Bitte versuchen Sie es in einigen Minuten erneut.",
          "Setup could not be started. Please try again in a few minutes."
        )
      );
    }
  }

  async function verify() {
    setError(null);
    try {
      const data = await verifyMutation.mutateAsync(token);
      if (data?.error) throw new Error(data.error);
      setStep("idle");
      if (data.backupCodes) {
        setBackupCodes(data.backupCodes);
      }
    } catch {
      setError(
        L(
          "Der Code wurde nicht akzeptiert. Bitte geben Sie den aktuell angezeigten Code aus Ihrer Authenticator-App ein.",
          "The code was not accepted. Please enter the code currently shown in your authenticator app."
        )
      );
    }
  }

  async function disable2FA() {
    setError(null);
    if (!disablePassword) {
      setError(L("Bitte geben Sie Ihr Passwort ein.", "Please enter your password."));
      return;
    }
    try {
      const data = await disableMutation.mutateAsync(disablePassword);
      if (data?.error) throw new Error(data.error);
      setStep("idle");
      setShowDisableDialog(false);
      setDisablePassword("");
    } catch {
      setError(
        L(
          "Die Zwei-Faktor-Anmeldung konnte nicht deaktiviert werden. Bitte prüfen Sie Ihr Passwort.",
          "Two-factor sign-in could not be disabled. Please check your password."
        )
      );
    }
  }

  const header = (
    <PageHeader
      title={t("settings.security.title")}
      description={L(
        "Schützen Sie Ihre Anmeldung mit einem zweiten Faktor aus einer Authenticator-App.",
        "Protect your sign-in with a second factor from an authenticator app."
      )}
      breadcrumbs={[
        { label: t("breadcrumb.dashboard"), href: "/dashboard" },
        { label: t("settings.title"), href: "/dashboard/settings" },
        { label: t("settings.security.breadcrumb") },
      ]}
    />
  );

  if (loading) {
    return (
      <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
        {header}
        <div role="status" aria-label={L("Wird geladen", "Loading")}>
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
      {header}

      {orgRequires2FA && !enabled && (
        <div className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4">
          <AlertTriangle
            size={18}
            className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
          />
          <div>
            <p className="text-sm font-medium text-[color:var(--ds-warning-text)]">
              {L(
                "Ihre Kanzlei schreibt die Zwei-Faktor-Anmeldung vor",
                "Your firm requires two-factor sign-in"
              )}
            </p>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              {L(
                "Ihre Kanzleiverwaltung hat die Zwei-Faktor-Anmeldung für alle Mitglieder verpflichtend gemacht. Bitte richten Sie sie jetzt ein, damit Ihr Zugang erhalten bleibt.",
                "Your firm administrator has made two-factor sign-in mandatory for all members. Please set it up now to keep your access."
              )}
            </p>
          </div>
        </div>
      )}

      {enabled ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] p-4">
            <CheckCircle2 size={18} className="text-[color:var(--ds-success-text)]" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[color:var(--ds-success-text)]">
                {L("Zwei-Faktor-Anmeldung ist aktiv", "Two-factor sign-in is active")}
              </p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {L(
                  "Bei jeder Anmeldung wird zusätzlich ein Code aus Ihrer Authenticator-App abgefragt.",
                  "Each sign-in also asks for a code from your authenticator app."
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              className="gap-2 text-sm text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
              onClick={() => {
                setShowDisableDialog(true);
                setError(null);
              }}
            >
              <Trash2 size={14} />
              {t("settings.security.btn_disable_2fa")}
            </Button>
          </div>

          {backupCodes && (
            <div className="space-y-3 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  size={16}
                  className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
                />
                <div>
                  <p className="text-sm font-medium text-[color:var(--ds-warning-text)]">
                    {L("Notfall-Codes sicher aufbewahren", "Store your backup codes safely")}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                    {L(
                      "Diese Codes werden nur einmal angezeigt. Jeder Code ersetzt einmalig den Code aus der App, etwa wenn Ihr Telefon verloren geht.",
                      "These codes are shown only once. Each code replaces the app code once, for example if you lose your phone."
                    )}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 font-mono text-sm sm:grid-cols-2">
                {backupCodes.map((code) => (
                  <div
                    key={code}
                    className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-center"
                  >
                    {code}
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                className="w-full gap-2 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(backupCodes.join("\n"));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? (
                  <CheckCircle2 size={14} className="text-[color:var(--ds-success-text)]" />
                ) : (
                  <KeyRound size={14} />
                )}
                {copied ? L("Kopiert", "Copied") : L("Codes kopieren", "Copy codes")}
              </Button>
            </div>
          )}

          {showDisableDialog && (
            <div className="space-y-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  size={16}
                  className="mt-0.5 shrink-0 text-[color:var(--ds-danger-text)]"
                />
                <div>
                  <p className="text-sm font-medium text-[color:var(--ds-danger-text)]">
                    {t("settings.security.btn_disable_2fa")}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                    Bitte bestätigen Sie mit Ihrem Passwort, dass Sie die Zwei-Faktor-Anmeldung
                    deaktivieren möchten.
                  </p>
                </div>
              </div>
              <input
                type="password"
                aria-label={t("settings.security.ph_password")}
                placeholder={t("settings.security.ph_password")}
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") disable2FA();
                }}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                autoFocus
              />
              {error && (
                <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  className="text-sm"
                  onClick={() => {
                    setShowDisableDialog(false);
                    setDisablePassword("");
                    setError(null);
                  }}
                >
                  {t("retention.confirm_cancel")}
                </Button>
                <Button
                  variant="ghost"
                  className="gap-2 text-sm text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
                  onClick={disable2FA}
                  disabled={disableMutation.isPending || !disablePassword}
                >
                  {disableMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  {t("settings.security.btn_disable_2fa")}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-start gap-3">
            <KeyRound size={16} className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]" />
            <div>
              <h2 className="text-sm font-medium text-[color:var(--ds-text)]">
                {t("settings.security.section_2fa")}
              </h2>
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                {L(
                  "Zusätzlich zum Passwort wird bei der Anmeldung ein sechsstelliger Code aus einer Authenticator-App abgefragt (z. B. Microsoft Authenticator, Google Authenticator).",
                  "In addition to your password, sign-in asks for a six-digit code from an authenticator app (e.g. Microsoft Authenticator, Google Authenticator)."
                )}
              </p>
            </div>
          </div>

          {step === "idle" && (
            <Button variant="primary" className="gap-2 text-sm" onClick={startSetup}>
              <QrCode size={14} />
              {t("settings.security.btn_enable_2fa")}
            </Button>
          )}

          {step === "setup" && (
            <div className="space-y-3">
              <div className="space-y-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-center">
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {L(
                    "Scannen Sie den QR-Code mit Ihrer Authenticator-App und geben Sie den angezeigten Code ein.",
                    "Scan the QR code with your authenticator app and enter the code it shows."
                  )}
                </p>
                <QRCodeSVG data={qrUrl} size={180} />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label={L("Sechsstelliger Code", "Six-digit code")}
                  placeholder={L("6-stelliger Code", "6-digit code")}
                  maxLength={6}
                  className="flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-center text-sm tracking-widest text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--ds-warning-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                />
                <Button
                  variant="primary"
                  className="text-sm whitespace-nowrap"
                  onClick={verify}
                  disabled={token.length !== 6 || verifyMutation.isPending}
                  loading={verifyMutation.isPending}
                >
                  {L("Bestätigen", "Confirm")}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-xs text-[color:var(--ds-danger-text)]">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}
        </div>
      )}

      {/* IP Allowlist Section — admin-only (the API requires connector.read) */}
      {isAdmin && ipAllowlistAvailable && (
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-[color:var(--ds-text-muted)]" />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {L("Zugriff nur aus freigegebenen Netzen (IP-Allowlist)", "IP allowlist")}
            </h2>
            {ipAllowlistEnabled ? (
              <Badge variant="default" className="text-xs">
                {lang === "en" ? "Active" : "Aktiv"}
              </Badge>
            ) : (
              <Badge variant="default" className="text-xs text-[color:var(--ds-text-muted)]">
                {lang === "en" ? "Inactive" : "Inaktiv"}
              </Badge>
            )}
          </div>

          {ipAllowlistLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <>
              <p className="text-xs text-[color:var(--ds-text-muted)]">{ipAllowlistNote}</p>

              {ipAllowlist.length > 0 ? (
                <div className="space-y-1.5">
                  {ipAllowlist.map((entry) => (
                    <div
                      key={entry}
                      className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-3 py-2"
                    >
                      <Shield size={12} className="text-[color:var(--ds-success-text)]" />
                      <span className="font-mono text-xs text-[color:var(--ds-text)]">{entry}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-3 py-3 text-xs text-[color:var(--ds-text-muted)]">
                  {lang === "en"
                    ? "No IPs configured. Set the "
                    : "Keine IPs konfiguriert. Setzen Sie die Umgebungsvariable "}
                  <code className="rounded bg-[color:var(--ds-surface)] px-1 py-0.5 font-mono">
                    SUBSUMIO_IP_ALLOWLIST
                  </code>{" "}
                  {lang === "en"
                    ? "environment variable to enable."
                    : "auf dem Server, um die Allowlist zu aktivieren."}
                </div>
              )}

              <div className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]">
                {lang === "en"
                  ? "Configure via environment variable:"
                  : "Konfiguration über Umgebungsvariable:"}
                <pre className="mt-1 font-mono text-xs whitespace-pre-wrap">
                  SUBSUMIO_IP_ALLOWLIST=10.0.0.0/8,192.168.1.100\nSUBSUMIO_TRUSTED_PROXY_HOPS=1
                </pre>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** QR-Code renderer — real QR code SVG from the server; neutral placeholder while loading. */
function QRCodeSVG({ data, size }: { data: string; size: number }) {
  const qrQuery = use2FAQrCode(data, size);
  const svg = qrQuery.data ?? null;

  if (svg) {
    return (
      <div
        className="inline-block rounded border border-[color:var(--ds-border)] bg-white p-2"
        style={{ width: size + 16, height: size + 16 }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  // While the real QR code loads (or if it cannot be generated) show a neutral placeholder —
  // never a fake pattern that looks scannable.
  return (
    <Skeleton
      className="mx-auto inline-block rounded border border-[color:var(--ds-border)]"
      style={{ width: size, height: size }}
    />
  );
}
