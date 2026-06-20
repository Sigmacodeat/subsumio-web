"use client";

import { useState } from "react";
import { Plus, Trash2, Copy, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApiKeys, useCreateApiKey, useDeleteApiKey } from "@/lib/queries/settings";
import { PageHeader } from "@/components/dashboard/page-header";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  active: boolean;
  createdAt: string;
  lastUsedAt?: string;
  createdBy?: string;
}

export default function ApiKeysPage() {
  const keysQuery = useApiKeys();
  const createMutation = useCreateApiKey();
  const deleteMutation = useDeleteApiKey();
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyPlaintext, setNewKeyPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keys: ApiKey[] = keysQuery.data?.keys || [];
  const loading = keysQuery.isLoading;

  async function createKey() {
    if (!newKeyName.trim()) return;
    setError(null);
    try {
      const data = await createMutation.mutateAsync(newKeyName.trim());
      setNewKeyPlaintext(data.plaintextKey);
      setNewKeyName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erstellen fehlgeschlagen");
    }
  }

  async function deleteKey(id: string) {
    try {
      await deleteMutation.mutateAsync(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="API-Keys"
        description="Drittanbieter-Integration (Zapier, beA, DATEV)"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "API-Keys" }]}
      />

      {/* Create Key */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Neuen API-Key erstellen</h2>
        <div className="flex gap-2">
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="z. B. Zapier-Integration"
            className="flex-1 bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none focus:border-[color:var(--brand-primary)]"
            onKeyDown={(e) => e.key === "Enter" && createKey()}
          />
          <Button
            variant="primary"
            className="brand-bg brand-bg text-white gap-2 text-sm"
            onClick={createKey}
            disabled={createMutation.isPending || !newKeyName.trim()}
          >
            {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Erstellen
          </Button>
        </div>

        {newKeyPlaintext && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600" />
              <span className="text-sm font-medium text-amber-600">Key wird nur EINMAL angezeigt</span>
            </div>
            <div className="flex items-center gap-2 bg-[color:var(--ds-surface)] rounded-lg px-3 py-2 border border-[color:var(--ds-border)]">
              <code className="text-sm text-[color:var(--ds-text)] font-mono flex-1 break-all">{newKeyPlaintext}</code>
              <button
                onClick={() => copyKey(newKeyPlaintext)}
                className="p-1.5 rounded-lg text-[color:var(--ds-text-muted)] hover:brand-text brand-bg/10 transition-all"
              >
                {copied ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Keys List */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]">
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Prefix</th>
              <th className="text-left px-4 py-3 font-medium">Scopes</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Erstellt</th>
              <th className="text-right px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[color:var(--ds-text-muted)]"><Loader2 size={16} className="animate-spin inline mr-2" />Lade…</td></tr>
            ) : keys.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[color:var(--ds-text-muted)]">Noch keine API-Keys vorhanden.</td></tr>
            ) : (
              keys.map((k) => (
                <tr key={k.id} className="border-b border-[color:var(--ds-border)]/50 hover:bg-[color:var(--ds-surface)] transition-colors">
                  <td className="px-4 py-3 text-[color:var(--ds-text)]">{k.name}</td>
                  <td className="px-4 py-3 text-[color:var(--ds-text-muted)] font-mono">{k.prefix}…</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {k.scopes.map((s) => (
                        <Badge key={s} variant="default" className="text-[10px] brand-soft brand-border brand-text">{s}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {k.active ? (
                      <span className="text-xs text-emerald-600">Aktiv</span>
                    ) : (
                      <span className="text-xs text-red-600">Inaktiv</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--ds-text-muted)]">{new Date(k.createdAt).toLocaleDateString("de-DE")}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteKey(k.id)}
                      className="p-1.5 rounded-lg text-[color:var(--ds-text-muted)] hover:text-red-600 hover:bg-red-500/10 transition-all"
                      title="Löschen"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Webhook Info */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-2">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Webhook-Endpoint</h2>
        <code className="block text-xs text-[color:var(--ds-text-muted)] font-mono bg-[color:var(--ds-surface)] rounded-lg px-3 py-2 border border-[color:var(--ds-border)]">
          POST https://ihre-domain.de/api/webhook/incoming
        </code>
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Header: <code className="brand-text">X-API-Key: sk_live_…</code><br />
          Events: <code className="brand-text">case.created</code>, <code className="brand-text">deadline.due</code>, <code className="brand-text">invoice.paid</code>, <code className="brand-text">email.received</code>
        </p>
      </div>
    </div>
  );
}
