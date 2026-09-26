"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";

interface DocusignStatus {
  configured: boolean;
  reason?: string;
  environment?: "demo" | "production";
  connected?: boolean;
  expired?: boolean;
  renewable?: boolean;
  email?: string | null;
  name?: string | null;
}

const CONFIG_REASONS: Record<string, string> = {
  demo_environment_in_production:
    "DocuSign ist auf die Test-Umgebung eingestellt; Signaturen dort sind nicht rechtsverbindlich. Der Betreiber muss die Produktions-Umgebung einrichten.",
};

/**
 * Personal DocuSign connection (per-user OAuth): status, connect via the
 * existing /api/docusign/auth flow, disconnect. The OAuth result comes back
 * as `?docusign=…` and is shown by the settings page (integration-return).
 */
export function DocusignConnectionCard() {
  const { addToast } = useToast();
  const [status, setStatus] = useState<DocusignStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/docusign/status", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json().catch(() => ({}));
      setStatus((data.data ?? data) as DocusignStatus);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect() {
    setBusy(true);
    try {
      const res = await fetch("/api/docusign/auth", { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.authUrl) throw new Error(data.error || "connect failed");
      window.location.href = data.authUrl;
    } catch {
      addToast({ type: "error", title: "DocuSign-Verbindung konnte nicht gestartet werden" });
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("DocuSign-Verbindung wirklich trennen?")) return;
    setBusy(true);
    try {
      const res = await csrfFetch("/api/docusign/disconnect", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      addToast({ type: "success", title: "DocuSign getrennt" });
      await load();
    } catch {
      addToast({ type: "error", title: "Trennen fehlgeschlagen" });
    } finally {
      setBusy(false);
    }
  }

  const envLabel =
    status?.environment === "production"
      ? "Produktion"
      : status?.environment === "demo"
        ? "Test-Umgebung (nicht rechtsverbindlich)"
        : null;
  const who = status?.email || status?.name || null;
  const needsReconnect = Boolean(status?.connected && status.expired && !status.renewable);
  const connected = Boolean(status?.connected) && !needsReconnect;

  let text: string;
  if (loadFailed) text = "Der Verbindungsstatus konnte nicht geladen werden.";
  else if (!status) text = "Verbindungsstatus wird geladen…";
  else if (!status.configured)
    text =
      CONFIG_REASONS[status.reason ?? ""] ??
      "DocuSign ist für diese Installation nicht eingerichtet.";
  else if (connected)
    text = `Verbunden${who ? ` als ${who}` : ""}. Signaturanfragen gehen in Ihrem Namen aus Ihrem DocuSign-Konto.`;
  else if (needsReconnect)
    text = `Die Verbindung${who ? ` (${who})` : ""} ist abgelaufen. Bitte neu verbinden.`;
  else
    text =
      "Nicht verbunden. Verbinden Sie Ihr DocuSign-Konto, damit Signaturanfragen in Ihrem Namen versendet werden.";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[color:var(--ds-text)]">DocuSign</h2>
          <p className="mt-1 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">{text}</p>
          {status?.configured && envLabel && (
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">Umgebung: {envLabel}</p>
          )}
        </div>
        {status?.configured && (
          <div className="flex shrink-0 items-center gap-2">
            {connected ? (
              <>
                <Badge variant="success">Verbunden</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void disconnect()}
                  disabled={busy}
                >
                  {busy && <Loader2 size={13} className="animate-spin" />}
                  Trennen
                </Button>
              </>
            ) : (
              <>
                {needsReconnect && <Badge variant="warning">Neu verbinden</Badge>}
                <Button variant="outline" size="sm" onClick={() => void connect()} disabled={busy}>
                  {busy && <Loader2 size={13} className="animate-spin" />}
                  {needsReconnect ? "DocuSign neu verbinden" : "Mit DocuSign verbinden"}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
