"use client";

// WP-5.29 — MCP-Zugang für die Kanzlei. Tokens werden auf der Engine als
// `web-mcp:{brainId}:{label}` access_tokens geführt und authentifizieren
// MCP-Clients gegen den /mcp-Endpunkt der Engine. Der Klartext-Token wird
// genau einmal angezeigt; serverseitig liegt nur der SHA-256-Hash.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { csrfFetch } from "@/lib/csrf";
import { formatDate, formatDateTime } from "@/lib/utils";

interface McpToken {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
}

export function McpTokensSection() {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [minted, setMinted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tokensQuery = useQuery({
    queryKey: ["mcp-tokens"],
    queryFn: async () => {
      const res = await fetch("/api/settings/mcp-tokens", { credentials: "same-origin" });
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()) as { tokens: McpToken[] };
    },
    staleTime: 30_000,
  });
  const tokens = (tokensQuery.data?.tokens ?? []).filter((t) => !t.revoked);

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await csrfFetch("/api/settings/mcp-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "create_failed");
      return data as { token?: string; data?: { token?: string } };
    },
    onSuccess: (data) => {
      const token = data.token ?? data.data?.token ?? null;
      setMinted(token);
      setNewName("");
      void qc.invalidateQueries({ queryKey: ["mcp-tokens"] });
      addToast({ type: "success", title: "MCP-Token erstellt" });
    },
    onError: () =>
      addToast({
        type: "error",
        title: "Token konnte nicht erstellt werden",
        description: "Bitte versuchen Sie es erneut.",
      }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await csrfFetch(`/api/settings/mcp-tokens/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("revoke_failed");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["mcp-tokens"] });
      addToast({ type: "success", title: "Token widerrufen" });
    },
    onError: () => addToast({ type: "error", title: "Token konnte nicht widerrufen werden" }),
  });

  async function revoke(t: McpToken) {
    const ok = await confirm({
      title: "MCP-Token widerrufen",
      message: `„${t.name}“ wird sofort ungültig. MCP-Clients mit diesem Token verlieren den Zugriff.`,
      confirmLabel: "Widerrufen",
      variant: "danger",
    });
    if (ok) revokeMutation.mutate(t.id);
  }

  async function copyToken() {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast({ type: "error", title: "Kopieren nicht möglich — bitte manuell markieren." });
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 md:p-5">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
          MCP-Zugang (Model Context Protocol)
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
          MCP-Tokens verbinden externe KI-Clients (z.&nbsp;B. Claude Desktop, Cursor) direkt mit dem
          Kanzlei-Brain. Der Client sendet den Token als{" "}
          <code className="font-mono text-[color:var(--ds-text)]">Authorization: Bearer …</code> an
          den MCP-Endpunkt Ihrer Engine.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">Bezeichnung des MCP-Tokens</span>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="z. B. Claude Desktop — Assistentin"
            maxLength={80}
            onKeyDown={(e) =>
              e.key === "Enter" && newName.trim() && createMutation.mutate(newName.trim())
            }
          />
        </label>
        <Button
          variant="primary"
          className="gap-2 whitespace-nowrap"
          onClick={() => createMutation.mutate(newName.trim())}
          disabled={createMutation.isPending || !newName.trim()}
        >
          {createMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Plus size={14} aria-hidden />
          )}
          Token erstellen
        </Button>
      </div>

      {minted && (
        <div className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3">
          <p className="mb-2 text-xs font-medium text-[color:var(--ds-warning-text)]">
            Token wird nur einmal angezeigt — jetzt kopieren und sicher hinterlegen.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-[color:var(--ds-surface)] px-2 py-1.5 font-mono text-xs text-[color:var(--ds-text)]">
              {minted}
            </code>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={copyToken}>
              {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
              {copied ? "Kopiert" : "Kopieren"}
            </Button>
          </div>
        </div>
      )}

      {tokensQuery.isLoading ? (
        <div className="space-y-2" role="status" aria-label="Tokens werden geladen">
          <div className="h-10 animate-pulse rounded-lg bg-[color:var(--ds-hover)]" />
          <div className="h-10 animate-pulse rounded-lg bg-[color:var(--ds-hover)]" />
        </div>
      ) : tokensQuery.isError ? (
        <p className="text-xs text-[color:var(--ds-danger-text)]">
          Die Token-Liste konnte nicht geladen werden.
        </p>
      ) : tokens.length === 0 ? (
        <p className="text-xs text-[color:var(--ds-text-subtle)]">
          Noch keine MCP-Tokens. Erstellen Sie eines, um einen externen KI-Client anzubinden.
        </p>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--ds-border)] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm text-[color:var(--ds-text)]">{t.name}</span>
                  <Badge variant="success">Aktiv</Badge>
                </div>
                <div className="mt-0.5 text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
                  erstellt {formatDate(t.createdAt)} · zuletzt genutzt{" "}
                  {t.lastUsedAt ? formatDateTime(t.lastUsedAt) : "noch nie"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => revoke(t)}
                disabled={revokeMutation.isPending}
                aria-label={`MCP-Token „${t.name}“ widerrufen`}
                title="Widerrufen"
                className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none disabled:opacity-50 motion-reduce:transition-none"
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
