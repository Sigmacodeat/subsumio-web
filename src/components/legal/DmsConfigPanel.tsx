"use client";

/**
 * DmsConfigPanel — richtet die DMS-Anbindung der eigenen Kanzlei ein.
 *
 * Nur für Administratoren. Der API-Schlüssel wird verschlüsselt auf dem
 * Server gespeichert und nie an den Browser zurückgegeben; das Formular
 * zeigt nur, ob einer hinterlegt ist. Leeres Schlüssel-Feld beim Ändern
 * behält den gespeicherten Schlüssel.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, XCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { csrfFetch } from "@/lib/csrf";
import { formatDateTime } from "@/lib/utils";

type Provider = "imanager" | "netdocuments" | "sharepoint" | "box";

interface DmsConfig {
  provider: Provider;
  baseUrl: string;
  hasApiKey: boolean;
  sharepointSiteId: string | null;
  sharepointDriveId: string | null;
  boxFolderId: string | null;
  updatedAt: string;
}

const PROVIDERS: Array<{ value: Provider; label: string; urlHint: string }> = [
  { value: "imanager", label: "iManage Work", urlHint: "https://ihre-kanzlei.imanage.work" },
  { value: "netdocuments", label: "NetDocuments", urlHint: "https://api.eu.netdocuments.com" },
  {
    value: "sharepoint",
    label: "SharePoint / OneDrive",
    urlHint: "https://ihre-kanzlei.sharepoint.com/sites/akten",
  },
  { value: "box", label: "Box", urlHint: "" },
];

async function readError(res: Response, fallback: string): Promise<string> {
  if (res.status === 403) return "Nur Administratoren können die DMS-Anbindung ändern.";
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return typeof body?.error === "string" && body.error ? body.error : fallback;
}

export function DmsConfigPanel({ onChanged }: { onChanged?: () => void }) {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [config, setConfig] = useState<DmsConfig | null>(null);

  const [provider, setProvider] = useState<Provider>("imanager");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [siteId, setSiteId] = useState("");
  const [driveId, setDriveId] = useState("");
  const [boxFolderId, setBoxFolderId] = useState("");

  const applyConfig = useCallback((c: DmsConfig | null) => {
    setConfig(c);
    setProvider(c?.provider ?? "imanager");
    setBaseUrl(c?.baseUrl ?? "");
    setApiKey("");
    setSiteId(c?.sharepointSiteId ?? "");
    setDriveId(c?.sharepointDriveId ?? "");
    setBoxFolderId(c?.boxFolderId ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await csrfFetch("/api/dms/config");
      if (!res.ok) {
        setLoadError(await readError(res, "Die DMS-Anbindung konnte nicht geladen werden."));
        return;
      }
      const body = (await res.json()) as { data?: { config?: DmsConfig | null } };
      applyConfig(body.data?.config ?? null);
    } catch {
      setLoadError("Die DMS-Anbindung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [applyConfig]);

  useEffect(() => {
    void load();
  }, [load]);

  const needsUrl = provider !== "box";
  const needsKey = !config?.hasApiKey;
  const canSave =
    !saving && (!needsUrl || baseUrl.trim().length > 0) && (!needsKey || apiKey.trim().length > 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await csrfFetch("/api/dms/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          baseUrl: needsUrl ? baseUrl.trim() : null,
          apiKey: apiKey.trim() || null,
          sharepointSiteId: provider === "sharepoint" ? siteId.trim() || null : null,
          sharepointDriveId: provider === "sharepoint" ? driveId.trim() || null : null,
          boxFolderId: provider === "box" ? boxFolderId.trim() || null : null,
        }),
      });
      if (!res.ok) {
        setFormError(await readError(res, "Die DMS-Anbindung konnte nicht gespeichert werden."));
        return;
      }
      const body = (await res.json()) as { data?: { config?: DmsConfig } };
      applyConfig(body.data?.config ?? null);
      addToast({ type: "success", description: "DMS-Anbindung gespeichert." });
      onChanged?.();
    } catch {
      setFormError("Die DMS-Anbindung konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "DMS-Anbindung entfernen?",
      message:
        "Der gespeicherte Zugang wird gelöscht. Bereits importierte Dokumente bleiben in Subsumio.",
      confirmLabel: "Entfernen",
      variant: "danger",
    });
    if (!ok) return;
    setRemoving(true);
    setFormError(null);
    try {
      const res = await csrfFetch("/api/dms/config", { method: "DELETE" });
      if (!res.ok) {
        setFormError(await readError(res, "Die DMS-Anbindung konnte nicht entfernt werden."));
        return;
      }
      applyConfig(null);
      addToast({ type: "success", description: "DMS-Anbindung entfernt." });
      onChanged?.();
    } catch {
      setFormError("Die DMS-Anbindung konnte nicht entfernt werden.");
    } finally {
      setRemoving(false);
    }
  }

  const hint = PROVIDERS.find((p) => p.value === provider)?.urlHint ?? "";

  return (
    <section
      aria-labelledby="dms-config-title"
      className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="dms-config-title" className="text-sm font-semibold text-[color:var(--ds-text)]">
            DMS-Anbindung der Kanzlei
          </h2>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            Verbinden Sie das Dokumentenmanagement Ihrer Kanzlei. Der Zugangsschlüssel wird
            verschlüsselt gespeichert und ist danach nicht mehr einsehbar.
          </p>
        </div>
        {config && (
          <Badge variant="success" className="gap-1 whitespace-nowrap">
            <CheckCircle2 size={11} aria-hidden="true" /> Eingerichtet
          </Badge>
        )}
      </div>

      {loading ? (
        <div
          role="status"
          className="flex items-center gap-2 text-sm text-[color:var(--ds-text-muted)]"
        >
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          DMS-Anbindung wird geladen …
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-sm text-[color:var(--ds-danger-text)]"
        >
          <XCircle size={14} className="shrink-0" aria-hidden="true" />
          <span className="flex-1">{loadError}</span>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Erneut versuchen
          </Button>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-[color:var(--ds-text-muted)]">
              <span>Anbieter</span>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                className="block h-9 w-full rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 text-sm text-[color:var(--ds-text)]"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {needsUrl && (
              <label className="space-y-1 text-xs text-[color:var(--ds-text-muted)]">
                <span>Adresse (https)</span>
                <Input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={hint}
                  autoComplete="off"
                  required
                />
              </label>
            )}
            <label className="space-y-1 text-xs text-[color:var(--ds-text-muted)] sm:col-span-2">
              <span>
                API-Schlüssel / Zugriffstoken
                {config?.hasApiKey ? " (leer lassen, um den gespeicherten zu behalten)" : ""}
              </span>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={config?.hasApiKey ? "•••••••• gespeichert" : ""}
                autoComplete="new-password"
                required={needsKey}
              />
            </label>
            {provider === "sharepoint" && (
              <>
                <label className="space-y-1 text-xs text-[color:var(--ds-text-muted)]">
                  <span>Site-ID (optional)</span>
                  <Input value={siteId} onChange={(e) => setSiteId(e.target.value)} />
                </label>
                <label className="space-y-1 text-xs text-[color:var(--ds-text-muted)]">
                  <span>Dokumentbibliothek / Drive-ID (optional)</span>
                  <Input value={driveId} onChange={(e) => setDriveId(e.target.value)} />
                </label>
              </>
            )}
            {provider === "box" && (
              <label className="space-y-1 text-xs text-[color:var(--ds-text-muted)]">
                <span>Stammordner-ID (optional)</span>
                <Input
                  value={boxFolderId}
                  onChange={(e) => setBoxFolderId(e.target.value)}
                  placeholder="0"
                />
              </label>
            )}
          </div>

          {formError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-sm text-[color:var(--ds-danger-text)]"
            >
              <XCircle size={14} className="shrink-0" aria-hidden="true" />
              {formError}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={!canSave}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {config ? "Änderungen speichern" : "DMS verbinden"}
            </Button>
            {config && (
              <Button type="button" variant="ghost" disabled={removing} onClick={remove}>
                {removing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Anbindung entfernen
              </Button>
            )}
            {config && (
              <span className="text-xs text-[color:var(--ds-text-muted)]">
                Zuletzt geändert: {formatDateTime(new Date(config.updatedAt))}
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
