"use client";

import { FileText, Download, ExternalLink, CheckCircle2, Copy } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { useState } from "react";

export default function WordAddinPage() {
  const [copied, setCopied] = useState(false);

  const manifestUrl = "https://subsum.io/word-addin/manifest.xml";
  const taskpaneUrl = "https://subsum.io/word-addin/taskpane.html";

  function copyManifestUrl() {
    void navigator.clipboard.writeText(manifestUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Word Add-in"
        description="Schriftsätze und Dokumente aus Subsumio direkt in Microsoft Word einfügen"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Word Add-in" }]}
      />

      {/* Hero */}
      <div className="rounded-2xl border border-[color:var(--ds-border)] bg-gradient-to-br from-[color:var(--ds-surface)] to-[color:var(--ds-surface-2)] p-6">
        <div className="flex items-start gap-4">
          <div className="brand-soft brand-border flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border">
            <FileText size={28} className="brand-text" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--ds-text)]">Subsumio für Word</h2>
            <p className="mt-1 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
              Greifen Sie aus Microsoft Word direkt auf Ihr Brain zu. Fügen Sie Schriftsätze,
              Verträge und Dokumente ein, ohne Word zu verlassen.
            </p>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {[
          {
            title: "Dokumente einfügen",
            desc: "Schriftsätze aus dem Brain direkt ins Word-Dokument",
          },
          {
            title: "Brain-Suche",
            desc: "Volltext-Suche über alle Brain-Pages ohne Word zu verlassen",
          },
          { title: "API-Token-Auth", desc: "Sichere Verbindung mit Ihrem persönlichen API-Token" },
          { title: "Office 365 Ready", desc: "Kompatibel mit Microsoft 365 und Office 2021+" },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
          >
            <div className="mb-1 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <h3 className="text-sm font-medium text-[color:var(--ds-text)]">{f.title}</h3>
            </div>
            <p className="text-xs text-[color:var(--ds-text-muted)]">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Installation */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Installation</h3>

        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="brand-soft brand-border brand-text flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold">
              1
            </div>
            <div className="text-sm text-[color:var(--ds-text-muted)]">
              <p className="font-medium text-[color:var(--ds-text)]">Manifest-URL kopieren</p>
              <p className="mt-0.5 text-xs">
                Kopieren Sie die URL und fügen Sie sie in Office unter &quot;Add-in hochladen&quot;
                ein.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 font-mono text-xs text-[color:var(--ds-text)]">
                  {manifestUrl}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyManifestUrl}
                  className="gap-1 text-xs"
                >
                  {copied ? (
                    <CheckCircle2 size={12} className="text-emerald-600" />
                  ) : (
                    <Copy size={12} />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="brand-soft brand-border brand-text flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold">
              2
            </div>
            <div className="text-sm text-[color:var(--ds-text-muted)]">
              <p className="font-medium text-[color:var(--ds-text)]">In Word öffnen</p>
              <p className="mt-0.5 text-xs">
                Word → Registerkarte &quot;Einfügen&quot; → &quot;Add-ins&quot; → &quot;Mein Add-in
                hochladen&quot; → Manifest-URL einfügen.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="brand-soft brand-border brand-text flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold">
              3
            </div>
            <div className="text-sm text-[color:var(--ds-text-muted)]">
              <p className="font-medium text-[color:var(--ds-text)]">API-Token eingeben</p>
              <p className="mt-0.5 text-xs">
                Generieren Sie einen API-Token unter{" "}
                <Link href="/dashboard/api-keys" className="brand-text hover:underline">
                  API-Schlüssel
                </Link>{" "}
                und fügen Sie ihn im Add-in ein.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="flex flex-wrap gap-3">
        <a href={manifestUrl} download>
          <Button variant="outline" className="gap-2">
            <Download size={15} /> Manifest herunterladen
          </Button>
        </a>
        <a href={taskpaneUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" className="gap-2">
            <ExternalLink size={15} /> Taskpane öffnen
          </Button>
        </a>
        <Link href="/dashboard/api-keys">
          <Button variant="outline" className="gap-2">
            <FileText size={15} /> API-Token generieren
          </Button>
        </Link>
      </div>

      <Badge variant="default" className="border-blue-500/20 bg-blue-500/10 text-xs text-blue-600">
        Version 1.0.0 · Office 365 / 2021+
      </Badge>
    </div>
  );
}
