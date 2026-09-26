"use client";

// Settings → Privatsphäre: vollständiger Kanzlei-Export (Art. 20 DSGVO,
// Anbieterwechsel). Startet den Hintergrund-Export in der Engine, zeigt den
// Fortschritt und bietet den fertigen Export einmalig zum Download an
// (signierter Link, höchstens 24 Stunden gültig, danach wird das Archiv
// gelöscht). Nur für die Kanzlei-Administration.

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { csrfFetch } from "@/lib/csrf";
import type { FirmExportView } from "@/lib/firm-export-link";

const POLL_MS = 5_000;

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString("de-AT", { maximumFractionDigits: 1 })} ${units[i]}`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("de-AT", {
        timeZone: "Europe/Vienna",
        dateStyle: "short",
        timeStyle: "short",
      });
}

export function progressPercent(e: FirmExportView): number | null {
  const total = e.progress.pages_total;
  if (!total || total <= 0) return null;
  if (e.progress.phase === "files" || e.progress.phase === "upload") return 100;
  return Math.min(100, Math.round((e.progress.pages_done / total) * 100));
}

export function FirmExportPanel() {
  const [exports, setExports] = useState<FirmExportView[] | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await csrfFetch("/api/data-export/full");
      const body = (await res.json().catch(() => null)) as {
        data?: { exports?: FirmExportView[] };
        error?: string;
      } | null;
      if (!res.ok) {
        setError(body?.error ?? "Der Exportstatus ist nicht abrufbar.");
        return;
      }
      setExports(body?.data?.exports ?? []);
      setError(null);
    } catch {
      setError("Der Exportstatus ist nicht abrufbar.");
    }
  }, []);

  const current = exports?.[0] ?? null;
  const active = current?.state === "queued" || current?.state === "running";

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while an export is being built.
  useEffect(() => {
    if (!active) return;
    timer.current = setTimeout(() => void load(), POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, exports, load]);

  async function start() {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/data-export/full", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Der Export konnte nicht gestartet werden.");
        return;
      }
      await load();
    } catch {
      setError("Der Export konnte nicht gestartet werden.");
    } finally {
      setStarting(false);
    }
  }

  const percent = current ? progressPercent(current) : null;

  return (
    <section
      aria-labelledby="firm-export-title"
      className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6"
    >
      <div className="flex items-center gap-2">
        <Archive size={18} className="text-[color:var(--ds-text-muted)]" aria-hidden />
        <h2 id="firm-export-title" className="text-sm font-semibold text-[color:var(--ds-text)]">
          Vollständiger Kanzlei-Export
        </h2>
      </div>
      <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
        Alle Einträge des Kanzleiwissens mit Text und Metadaten sowie alle Originaldateien in einem
        ZIP-Archiv — für einen Anbieterwechsel oder die Archivierung (Art. 20 DSGVO). Der Export
        läuft im Hintergrund; Sie werden benachrichtigt, sobald er fertig ist. Er enthält, was Ihr
        Zugang sehen darf (gesperrte Akten bleiben außen vor), und lässt sich einmal innerhalb von
        24 Stunden herunterladen. Danach wird das Archiv gelöscht.
      </p>

      {current && active && (
        <div role="status" aria-live="polite" className="space-y-2">
          <p className="text-sm text-[color:var(--ds-text)]">
            {current.state === "queued"
              ? "Export wartet auf den Start …"
              : current.progress.phase === "files"
                ? `Originaldateien werden gepackt (${current.progress.files_done.toLocaleString("de-AT")}) …`
                : current.progress.phase === "upload"
                  ? "Archiv wird abgelegt …"
                  : `Einträge werden gepackt (${current.progress.pages_done.toLocaleString("de-AT")}${
                      current.progress.pages_total
                        ? ` von ${current.progress.pages_total.toLocaleString("de-AT")}`
                        : ""
                    }) …`}
          </p>
          {percent !== null && <Progress value={percent} aria-label="Fortschritt des Exports" />}
        </div>
      )}

      {current?.state === "ready" && current.own && current.download_url && (
        <div role="status" className="space-y-2">
          <p className="text-sm text-[color:var(--ds-text)]">
            Export vom {formatWhen(current.finished_at)}: {current.pages?.toLocaleString("de-AT")}{" "}
            Einträge, {current.files?.toLocaleString("de-AT")} Originaldateien
            {current.size_bytes ? `, ${formatBytes(current.size_bytes)}` : ""}.{" "}
            {current.complete
              ? "Vollständig."
              : `Nicht vollständig: ${current.pages_missing ?? 0} Einträge und ${current.files_missing ?? 0} Dateien fehlen (Details in manifest.json).`}
          </p>
          <p className="text-xs text-[color:var(--ds-text-subtle)]">
            Einmaliger Download bis {formatWhen(current.link_expires_at ?? current.expires_at)}.
            {current.sha256 ? ` Prüfsumme (SHA-256): ${current.sha256}` : ""}
          </p>
          <Button variant="outline" size="sm" asChild>
            <a
              href={current.download_url}
              download
              // Single-use link: refresh the state once the download started.
              onClick={() => setTimeout(() => void load(), 3_000)}
            >
              <Download size={14} aria-hidden />
              Export herunterladen
            </a>
          </Button>
        </div>
      )}

      {current?.state === "ready" && !current.own && (
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          Ein Export einer anderen Administratorin bzw. eines anderen Administrators liegt zum
          Download bereit.
        </p>
      )}

      {current?.state === "failed" && (
        <p role="alert" className="text-sm text-[color:var(--ds-danger-text)]">
          Der letzte Export ist fehlgeschlagen. Bitte starten Sie ihn erneut.
        </p>
      )}

      {current?.state === "downloaded" && (
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          Der letzte Export wurde am {formatWhen(current.downloaded_at)} heruntergeladen und
          gelöscht.
        </p>
      )}

      {!active && (
        <Button variant="outline" size="sm" onClick={() => void start()} disabled={starting}>
          {starting ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Archive size={14} aria-hidden />
          )}
          Neuen Export anfordern
        </Button>
      )}

      {error && (
        <p role="alert" className="text-sm text-[color:var(--ds-danger-text)]">
          {error}
        </p>
      )}
    </section>
  );
}
