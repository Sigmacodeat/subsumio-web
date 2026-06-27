"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Bell, Camera, Fingerprint, Share2, Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  detectCapabilities,
  registerPush,
  capturePhoto,
  biometricAuth,
  nativeShare,
  type MobileCapabilities,
} from "@/lib/mobile-bridge";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";

export default function MobilePage() {
  const { t } = useLang();
  const [caps, setCaps] = useState<MobileCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushStatus, setPushStatus] = useState<string>("");
  const [bioStatus, setBioStatus] = useState<string>("");
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    detectCapabilities().then((c) => {
      if (cancelled) return;
      setCaps(c);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePush() {
    setPushStatus("Registriere…");
    const res = await registerPush();
    setPushStatus(res.error || "Push-Token erhalten");
  }

  async function handlePhoto() {
    setPhoto(null);
    const res = await capturePhoto();
    if (res.base64) {
      setPhoto(`data:image/jpeg;base64,${res.base64}`);
    } else if (res.error) {
      // Fallback: trigger file input
      document.getElementById("mobile-file-input")?.click();
    }
  }

  async function handleBiometric() {
    setBioStatus("Prüfe…");
    const res = await biometricAuth();
    setBioStatus(res.success ? "Authentifiziert" : res.error || "Fehlgeschlagen");
  }

  async function handleShare() {
    await nativeShare({
      title: "Subsumio",
      text: "Mein Kanzlei-OS für rechtliche Intelligenz.",
      url: "https://subsum.eu",
    });
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="brand-text animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("mobile.title")}
        description={t("mobile.description")}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: t("mobile.breadcrumb") },
        ]}
      />

      {/* Status */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { key: "push", label: "Push", icon: Bell, available: caps?.push },
          { key: "camera", label: "Kamera", icon: Camera, available: caps?.camera },
          { key: "biometric", label: "Biometrie", icon: Fingerprint, available: caps?.biometric },
          { key: "share", label: "Teilen", icon: Share2, available: caps?.share },
        ].map((f) => (
          <div
            key={f.key}
            className={cn(
              "rounded-xl border p-3 text-center",
              f.available
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
            )}
          >
            <f.icon
              size={18}
              className={cn(
                "mx-auto mb-2",
                f.available ? "text-emerald-600" : "text-[color:var(--ds-text-subtle)]"
              )}
            />
            <div className="text-xs text-[color:var(--ds-text-muted)]">{f.label}</div>
            <div
              className={cn(
                "text-xs font-medium",
                f.available ? "text-emerald-600" : "text-[color:var(--ds-text-subtle)]"
              )}
            >
              {f.available ? "Verfügbar" : "Nicht verfügbar"}
            </div>
          </div>
        ))}
      </div>

      {/* Features */}
      <div className="space-y-3">
        {/* Push */}
        <div className="flex items-center justify-between rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/10">
              <Bell size={18} className="text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-[color:var(--ds-text)]">
                Push-Benachrichtigungen
              </p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {pushStatus ||
                  (caps?.push ? "Bereit zur Registrierung" : "Nur in nativer App verfügbar")}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            className="gap-2 bg-teal-600 text-sm text-white hover:bg-teal-500"
            disabled={!caps?.push}
            onClick={handlePush}
          >
            <Bell size={14} />
            Registrieren
          </Button>
        </div>

        {/* Camera */}
        <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="brand-soft flex h-10 w-10 items-center justify-center rounded-lg">
                <Camera size={18} className="brand-text" />
              </div>
              <div>
                <p className="text-sm font-medium text-[color:var(--ds-text)]">Dokumenten-Scan</p>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {caps?.camera ? "Kamera verfügbar" : "Datei-Upload als Fallback"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                className="brand-bg brand-bg gap-2 text-sm text-white"
                onClick={handlePhoto}
              >
                <Camera size={14} />
                Scannen
              </Button>
              <input
                id="mobile-file-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => setPhoto(ev.target?.result as string);
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </div>
          </div>
          {photo && (
            <div className="brand-border brand-soft/5 rounded-lg border p-2">
              <Image
                src={photo}
                alt="Scan"
                width={320}
                height={192}
                unoptimized
                className="mx-auto max-h-48 rounded object-contain"
              />
              <p className="mt-1 text-center text-xs text-[color:var(--ds-text-muted)]">
                Vorschau — speichern in Akte über Upload
              </p>
            </div>
          )}
        </div>

        {/* Biometric */}
        <div className="flex items-center justify-between rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <Fingerprint size={18} className="text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-[color:var(--ds-text)]">
                Biometrische Entsperrung
              </p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {bioStatus ||
                  (caps?.biometric ? "Face ID / Touch ID / Fingerabdruck" : "Nur in nativer App")}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            className="gap-2 bg-amber-600 text-sm text-white hover:bg-amber-500"
            disabled={!caps?.biometric}
            onClick={handleBiometric}
          >
            <Fingerprint size={14} />
            Testen
          </Button>
        </div>

        {/* Share */}
        <div className="flex items-center justify-between rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Share2 size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-[color:var(--ds-text)]">Teilen</p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Native Share Sheet oder Web Share API
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            className="gap-2 bg-blue-600 text-sm text-white hover:bg-blue-500"
            disabled={!caps?.share}
            onClick={handleShare}
          >
            <Share2 size={14} />
            Teilen
          </Button>
        </div>
      </div>

      {/* Install hint */}
      {!caps?.isNative && (
        <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-4">
          <div className="flex items-start gap-3">
            <QrCode size={18} className="mt-0.5 shrink-0 text-teal-600" />
            <div>
              <p className="text-sm font-medium text-teal-600">Native App installieren</p>
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                Für Push, Biometrie und Kamera-Scan: Baue die Capacitor-App mit{" "}
                <code className="rounded bg-[color:var(--ds-hover)] px-1.5 py-0.5 font-mono text-xs">
                  bun run build:mobile
                </code>
                . Siehe{" "}
                <code className="rounded bg-[color:var(--ds-hover)] px-1.5 py-0.5 font-mono text-xs">
                  mobile/README.md
                </code>
                .
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
