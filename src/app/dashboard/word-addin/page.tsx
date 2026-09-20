"use client";

import { Download, CheckCircle2, Copy, KeyRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";

const MANIFEST_URL = "https://subsum.io/word-addin/manifest.xml";

/**
 * Was das Add-in (public/word-addin/taskpane.js) tatsächlich kann —
 * nur Funktionen aufführen, die dort umgesetzt sind.
 */
const FEATURES: { title: string; desc: string }[] = [
  {
    title: "Markierten Text prüfen",
    desc: "Vertragsanalyse, Zusammenfassung, Pflichten und Risiken zum in Word markierten Text.",
  },
  {
    title: "Vertragsentwurf und Überarbeitung",
    desc: "Entwurf nach Ihrer Anweisung erstellen oder markierten Vertrag überarbeiten und ins Dokument einfügen.",
  },
  {
    title: "Aus der Akte arbeiten",
    desc: "Aktenüberblick laden und eine Chronologie der Akte direkt ins Dokument einfügen.",
  },
  {
    title: "In Subsumio ablegen",
    desc: "Markierten Text als Dokument in einer Akte oder im Kanzleiwissen speichern.",
  },
];

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-xs font-semibold text-[color:var(--ds-text)] tabular-nums"
      >
        {n}
      </span>
      <div className="min-w-0 text-sm text-[color:var(--ds-text-muted)]">
        <p className="font-medium text-[color:var(--ds-text)]">{title}</p>
        <div className="mt-0.5 text-xs leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

export default function WordAddinPage() {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  async function copyManifestUrl() {
    try {
      await navigator.clipboard.writeText(MANIFEST_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Kopieren nicht erlaubt — die Adresse bleibt markierbar sichtbar. */
    }
  }

  return (
    <div className="mx-auto max-w-[720px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("wordaddin.title")}
        description="Arbeiten Sie mit Subsumio direkt in Microsoft Word — Texte prüfen, Verträge entwerfen und Ergebnisse in der Akte ablegen."
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("wordaddin.breadcrumb") },
        ]}
      />

      <section className="space-y-3">
        <h2 className="text-xs font-medium tracking-wide text-[color:var(--ds-text-muted)] uppercase">
          Funktionen
        </h2>
        <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex gap-3 p-4">
              <CheckCircle2
                size={14}
                aria-hidden
                className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]"
              />
              <div>
                <h3 className="text-sm font-medium text-[color:var(--ds-text)]">{f.title}</h3>
                <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">{f.desc}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Ergebnisse des Assistenten sind Entwürfe und vor der Verwendung anwaltlich zu prüfen.
          Läuft mit Microsoft 365 und Office 2021 oder neuer.
        </p>
      </section>

      <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 md:p-5">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {t("wordaddin.install_title")}
        </h2>
        <ol className="space-y-4">
          <Step n={1} title="Adresse des Add-ins kopieren">
            <p>Diese Adresse benötigt Word, um das Add-in zu laden.</p>
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <code className="min-w-0 truncate rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 font-mono text-xs text-[color:var(--ds-text)]">
                {MANIFEST_URL}
              </code>
              <Button
                variant="ghost"
                size="sm"
                aria-label={copied ? "Kopiert" : "Adresse kopieren"}
                title="Adresse kopieren"
                onClick={copyManifestUrl}
              >
                {copied ? (
                  <CheckCircle2
                    size={12}
                    aria-hidden
                    className="text-[color:var(--ds-success-text)]"
                  />
                ) : (
                  <Copy size={12} aria-hidden />
                )}
              </Button>
            </div>
          </Step>
          <Step n={2} title="In Word hinzufügen">
            <p>
              Word → Registerkarte „Einfügen“ → „Add-ins“ → „Mein Add-in hochladen“ → Adresse
              einfügen oder die heruntergeladene Datei auswählen.
            </p>
            <Button variant="outline" size="sm" className="mt-2 gap-2 whitespace-nowrap" asChild>
              <a href={MANIFEST_URL} download>
                <Download size={13} aria-hidden /> Add-in-Datei herunterladen
              </a>
            </Button>
          </Step>
          <Step n={3} title="Mit Ihrem Konto verbinden">
            <p>
              Erstellen Sie einen Zugangsschlüssel und fügen Sie ihn im Add-in unter „Verbinden“
              ein. Der Schlüssel wird nur einmal angezeigt.
            </p>
            <Button variant="primary" size="sm" className="mt-2 gap-2 whitespace-nowrap" asChild>
              <Link href="/dashboard/api-keys">
                <KeyRound size={13} aria-hidden /> Zugangsschlüssel erstellen
              </Link>
            </Button>
          </Step>
        </ol>
      </section>
    </div>
  );
}
