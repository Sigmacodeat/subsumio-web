"use client";

import { useState, useEffect } from "react";
import { QrCode, KeyRound, CheckCircle2, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMe, use2FASetup, use2FAVerify, use2FADisable, use2FAQrCode } from "@/lib/queries/auth";
import { loadKanzleiSettings } from "@/lib/kanzlei-settings";
import { PageHeader } from "@/components/dashboard/page-header";

export default function SecuritySettingsPage() {
  const [step, setStep] = useState<"idle" | "setup" | "verify">("idle");
  const [qrUrl, setQrUrl] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [orgRequires2FA, setOrgRequires2FA] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  const meQuery = useMe();
  const setupMutation = use2FASetup();
  const verifyMutation = use2FAVerify();
  const disableMutation = use2FADisable();

  const enabled = !!meQuery.data?.user?.twoFactorEnabled;
  const loading = meQuery.isLoading;

  useEffect(() => {
    loadKanzleiSettings()
      .then((s) => setOrgRequires2FA(s.require2FA ?? false))
      .catch(() => {});
  }, []);

  async function startSetup() {
    setError(null);
    try {
      const data = await setupMutation.mutateAsync();
      setQrUrl(data.qrData);
      setStep("setup");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup fehlgeschlagen");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verifizierung fehlgeschlagen");
    }
  }

  async function disable2FA() {
    setError(null);
    if (!disablePassword) {
      setError("Bitte geben Sie Ihr Passwort ein");
      return;
    }
    try {
      const data = await disableMutation.mutateAsync(disablePassword);
      if (data?.error) throw new Error(data.error);
      setStep("idle");
      setShowDisableDialog(false);
      setDisablePassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deaktivierung fehlgeschlagen");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-2xl items-center justify-center p-6 py-20">
        <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <PageHeader title="Sicherheit" description="Zwei-Faktor-Authentifizierung" />

      {orgRequires2FA && !enabled && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-medium text-amber-600">
              2FA von Ihrer Kanzlei vorgeschrieben
            </p>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              Ihr Administrator hat 2FA für alle Teammitglieder verpflichtend aktiviert. Bitte
              richten Sie Zwei-Faktor-Authentifizierung ein, um Zugriff zu behalten.
            </p>
          </div>
        </div>
      )}

      {enabled ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <CheckCircle2 size={18} className="text-emerald-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-600">2FA ist aktiviert</p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Ihr Account ist durch TOTP-geschützt.
              </p>
            </div>
            <Button
              variant="ghost"
              className="gap-2 text-sm text-red-600 hover:bg-red-500/10 hover:text-red-700"
              onClick={() => {
                setShowDisableDialog(true);
                setError(null);
              }}
            >
              <Trash2 size={14} />
              Deaktivieren
            </Button>
          </div>

          {backupCodes && (
            <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-medium text-amber-600">
                    Backup-Codes — sicher speichern!
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                    Diese Codes werden nur einmal angezeigt. Speichern Sie sie an einem sicheren
                    Ort. Jeder Code kann einmal anstelle eines TOTP-Codes verwendet werden.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
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
                  <CheckCircle2 size={14} className="text-emerald-600" />
                ) : (
                  <KeyRound size={14} />
                )}
                {copied ? "Kopiert!" : "Alle Codes kopieren"}
              </Button>
            </div>
          )}

          {showDisableDialog && (
            <div className="space-y-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
                <div>
                  <p className="text-sm font-medium text-red-600">2FA deaktivieren</p>
                  <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                    Bitte bestätigen Sie mit Ihrem Passwort, dass Sie 2FA deaktivieren möchten.
                  </p>
                </div>
              </div>
              <input
                type="password"
                placeholder="Passwort"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") disable2FA();
                }}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:ring-2 focus:ring-red-500/30 focus:outline-none"
                autoFocus
              />
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
                  Abbrechen
                </Button>
                <Button
                  variant="ghost"
                  className="gap-2 text-sm text-red-600 hover:bg-red-500/10 hover:text-red-700"
                  onClick={disable2FA}
                  disabled={disableMutation.isPending || !disablePassword}
                >
                  {disableMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  Bestätigen & Deaktivieren
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-start gap-3">
            <KeyRound size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-[color:var(--ds-text)]">
                Zwei-Faktor-Authentifizierung (2FA)
              </p>
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                Schützen Sie Ihren Account mit einem zeitbasierten Einmalcode (TOTP). Scannen Sie
                den QR-Code mit einer Authenticator-App (z.B. Google Authenticator, Authy).
              </p>
            </div>
          </div>

          {step === "idle" && (
            <Button
              variant="primary"
              className="gap-2 bg-amber-600 text-sm text-white hover:bg-amber-500"
              onClick={startSetup}
            >
              <QrCode size={14} />
              2FA einrichten
            </Button>
          )}

          {step === "setup" && (
            <div className="space-y-3">
              <div className="space-y-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-center">
                <p className="text-xs text-[color:var(--ds-text-muted)]">QR-Code scannen:</p>
                <QRCodeSVG data={qrUrl} size={180} />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="6-stelliger Code"
                  maxLength={6}
                  className="flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-center text-sm tracking-widest text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-amber-500/50 focus:outline-none"
                />
                <Button
                  variant="primary"
                  className="bg-amber-600 text-sm text-white hover:bg-amber-500"
                  onClick={verify}
                  disabled={token.length !== 6}
                >
                  Verifizieren
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-700">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** QR-Code renderer — generates a real QR code SVG via the otpauth+qrcode libraries (server-side API call). Falls back to a deterministic grid pattern only if the API call fails. */
function QRCodeSVG({ data, size }: { data: string; size: number }) {
  const qrQuery = use2FAQrCode(data, size);
  const svg = qrQuery.data ?? null;

  if (svg) {
    return (
      <div
        className="inline-block rounded border border-[color:var(--ds-border)] bg-white p-2"
        style={{ width: size + 16, height: size + 16 }}
        title={data}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  // Fallback: deterministic grid pattern while the real QR loads or if the API is unavailable
  return (
    <div
      className="inline-block animate-pulse rounded border border-[color:var(--ds-border)] bg-white"
      style={{ width: size, height: size }}
      title={data}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {Array.from({ length: 25 }).map((_, y) =>
          Array.from({ length: 25 }).map((_, x) => {
            const hash = (x * 7 + y * 13 + data.length * 3) % 2;
            return (
              <rect
                key={`${x}-${y}`}
                x={x * (size / 25)}
                y={y * (size / 25)}
                width={size / 25}
                height={size / 25}
                fill={hash === 0 ? "#000" : "#fff"}
              />
            );
          })
        )}
      </svg>
    </div>
  );
}
