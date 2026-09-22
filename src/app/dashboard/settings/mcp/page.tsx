"use client";

import { useState, useEffect, useCallback } from "react";
import { KeyRound, Trash2, Loader2, Copy, Check, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { EmptyState } from "@/components/dashboard/empty-state";
import { unwrapApiBody } from "@/lib/api-body";

type McpToken = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
};

export default function McpTokensPage() {
  const { addToast } = useToast();
  const { t, lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);

  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [endpoint, setEndpoint] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/mcp-tokens");
      if (!res.ok) throw new Error();
      const data = unwrapApiBody(await res.json()) as {
        tokens?: McpToken[];
        endpoint?: string;
      };
      setTokens(data.tokens ?? []);
      if (data.endpoint) setEndpoint(data.endpoint);
    } catch {
      addToast({ type: "error", title: t("webhooks.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!name.trim()) {
      addToast({ type: "error", title: t("webhooks.err_required") });
      return;
    }
    setSaving(true);
    try {
      const res = await csrfFetch("/api/settings/mcp-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { token?: string };
      setFreshToken(data.token ?? null);
      setName("");
      setShowForm(false);
      addToast({ type: "success", title: t("webhooks.saved") });
      await load();
    } catch {
      addToast({ type: "error", title: t("webhooks.err_save") });
    } finally {
      setSaving(false);
    }
  }

  async function revoke(id: string, tokenName: string) {
    if (
      !window.confirm(
        L(
          `Zugang „${tokenName}" widerrufen? KI-Werkzeuge mit diesem Schlüssel verlieren sofort den Zugriff.`,
          `Revoke access "${tokenName}"? AI tools using this key lose access immediately.`
        )
      )
    )
      return;
    setDeleting(id);
    try {
      const res = await csrfFetch(`/api/settings/mcp-tokens/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      addToast({ type: "success", title: t("webhooks.deleted") });
      await load();
    } catch {
      addToast({ type: "error", title: t("webhooks.err_delete") });
    } finally {
      setDeleting(null);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast({ type: "error", title: L("Kopieren fehlgeschlagen", "Copy failed") });
    }
  }

  const configSnippet = JSON.stringify(
    {
      mcpServers: {
        subsumio: {
          type: "http",
          url: endpoint || "https://<engine>/mcp",
          headers: { Authorization: "Bearer gbrain_…" },
        },
      },
    },
    null,
    2
  );

  return (
    <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={L("KI-Zugriff (MCP)", "AI access (MCP)")}
        description={L(
          "Geben Sie KI-Assistenten wie Claude kontrollierten Lesezugriff auf das Kanzleiwissen – über das Model Context Protocol. Jeder Schlüssel kann jederzeit widerrufen werden.",
          "Give AI assistants like Claude controlled read access to the firm knowledge – via the Model Context Protocol. Every key can be revoked at any time."
        )}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("settings.title"), href: "/dashboard/settings" },
          { label: "MCP" },
        ]}
        actions={
          !showForm ? (
            <PrimaryAction onClick={() => setShowForm(true)}>
              {L("Neuer Schlüssel", "New key")}
            </PrimaryAction>
          ) : undefined
        }
      />

      {showForm && (
        <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {L("Zugangsschlüssel erstellen", "Create access key")}
          </h2>
          <div className="space-y-1">
            <Label htmlFor="mcp-name" className="text-xs text-[color:var(--ds-text-muted)]">
              {L("Bezeichnung", "Label")}
            </Label>
            <Input
              id="mcp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={L(
                "z. B. Claude Desktop – Kanzlei-Notebook",
                "e.g. Claude Desktop – firm laptop"
              )}
              maxLength={80}
            />
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {L(
                "Ein erkennbarer Name, damit Sie später wissen, welches Gerät oder Programm diesen Schlüssel nutzt.",
                "A recognizable name so you later know which device or program uses this key."
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void create()} disabled={saving} loading={saving}>
              {t("webhooks.save")}
            </Button>
            <Button onClick={() => setShowForm(false)} variant="ghost">
              {t("webhooks.cancel")}
            </Button>
          </div>
        </section>
      )}

      {freshToken && (
        <section
          className="space-y-3 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-5"
          role="status"
        >
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {L("Schlüssel wurde erstellt – jetzt kopieren", "Key created – copy it now")}
          </h2>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            {L(
              "Der Schlüssel wird aus Sicherheitsgründen nur dieses eine Mal angezeigt.",
              "For security reasons the key is shown only this once."
            )}
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 font-mono text-xs text-[color:var(--ds-text)]">
              {freshToken}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copy(freshToken)}
              aria-label={L("Schlüssel kopieren", "Copy key")}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setFreshToken(null)}>
            {L("Verstanden", "Got it")}
          </Button>
        </section>
      )}

      <section className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
          <Terminal size={14} className="text-[color:var(--ds-text-muted)]" />
          {L("Einrichtung im KI-Programm", "Setup in your AI program")}
        </h2>
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          {L(
            "Tragen Sie diesen Server in der Konfiguration Ihres KI-Programms ein (z. B. claude_desktop_config.json).",
            "Add this server to your AI program's configuration (e.g. claude_desktop_config.json)."
          )}
        </p>
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 font-mono text-xs text-[color:var(--ds-text)]">
            {configSnippet}
          </pre>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void copy(configSnippet)}
            aria-label={L("Konfiguration kopieren", "Copy configuration")}
            className="absolute top-2 right-2 h-7 w-7"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="space-y-2" role="status" aria-label={L("Wird geladen", "Loading")}>
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : tokens.length === 0 ? (
        !showForm && (
          <EmptyState
            icon={KeyRound}
            title={L("Noch keine Zugangsschlüssel", "No access keys yet")}
            description={L(
              "Erstellen Sie einen Schlüssel, um einem KI-Programm lesenden Zugriff auf Ihr Kanzleiwissen zu geben.",
              "Create a key to give an AI program read access to your firm knowledge."
            )}
            actionLabel={L("Neuer Schlüssel", "New key")}
            onAction={() => setShowForm(true)}
          />
        )
      ) : (
        <ul className="space-y-2">
          {tokens.map((tok) => (
            <li
              key={tok.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <KeyRound size={14} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                  <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                    {tok.name}
                  </span>
                  {tok.revoked && (
                    <Badge variant="default" className="text-xs">
                      {L("widerrufen", "revoked")}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
                  {L("Erstellt", "Created")} {formatDateTime(tok.createdAt)}
                  {tok.lastUsedAt &&
                    ` · ${L("Zuletzt verwendet", "Last used")} ${formatDateTime(tok.lastUsedAt)}`}
                </div>
              </div>
              {!tok.revoked && (
                <Button
                  onClick={() => void revoke(tok.id, tok.name)}
                  disabled={deleting === tok.id}
                  variant="ghost"
                  size="icon"
                  aria-label={L("Schlüssel widerrufen", "Revoke key")}
                  className="h-8 w-8 shrink-0 text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)]"
                >
                  {deleting === tok.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
