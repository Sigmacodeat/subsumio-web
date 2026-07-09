"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Loader2, FileCheck, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import type { PowerOfAttorney } from "@/lib/power-of-attorney";
import { POA_TYPE_LABELS, POA_STATUS_LABELS, isPoAValid } from "@/lib/power-of-attorney";

export default function PowerOfAttorneyPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const searchParams = useSearchParams();
  const [poas, setPoas] = useState<PowerOfAttorney[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    case_slug: searchParams.get("case_slug") ?? "",
    client_name: searchParams.get("client_name") ?? "",
    client_email: searchParams.get("client_email") ?? "",
    type: (searchParams.get("type") as PowerOfAttorney["type"]) || "general",
    scope: "",
    expires_at: "",
  });

  useEffect(() => {
    const caseSlug = searchParams.get("case_slug");
    const clientName = searchParams.get("client_name");
    if (caseSlug || clientName) {
      setForm((prev) => ({
        ...prev,
        case_slug: caseSlug ?? prev.case_slug,
        client_name: clientName ?? prev.client_name,
        client_email: searchParams.get("client_email") ?? prev.client_email,
        type: (searchParams.get("type") as PowerOfAttorney["type"]) || prev.type,
      }));
      setShowCreate(true);
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    try {
      const pages = await api.brain.listPages({ type: "power_of_attorney", limit: 200 });
      setPoas(pages.map((p) => p.frontmatter as unknown as PowerOfAttorney));
    } catch {
      addToast({ type: "error", title: t("poa.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!form.case_slug || !form.client_name || !form.scope) {
      addToast({ type: "error", title: "Pflichtfelder fehlen" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/power-of-attorney", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_slug: form.case_slug,
          client_name: form.client_name,
          client_email: form.client_email || undefined,
          type: form.type,
          scope: form.scope,
          expires_at: form.expires_at || undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addToast({ type: "success", title: "Vollmacht erstellt" });
      setShowCreate(false);
      setForm({
        case_slug: "",
        client_name: "",
        client_email: "",
        type: "general",
        scope: "",
        expires_at: "",
      });
      void load();
    } catch (e) {
      addToast({
        type: "error",
        title: "Fehler",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  const expiringCount = poas.filter(
    (p) =>
      p.status === "signed" &&
      p.expires_at &&
      new Date(p.expires_at) < new Date(Date.now() + 30 * 86400000)
  ).length;

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("poa.title")}
        description={t("poa.description")}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: t("poa.title") }]}
        actions={
          <Button onClick={() => setShowCreate(!showCreate)} className="brand-bg gap-2 text-white">
            <Plus size={16} /> Vollmacht
          </Button>
        }
      />

      {expiringCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-orange-600" />
          <p className="text-sm text-orange-600">
            <strong>{expiringCount}</strong> Vollmacht(en) laufen innerhalb von 30 Tagen ab.
          </p>
        </div>
      )}

      {showCreate && (
        <form
          className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <h2 className="text-sm font-semibold">Neue Vollmacht</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Akte *</Label>
              <Input
                value={form.case_slug}
                onChange={(e) => setForm({ ...form, case_slug: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Mandant *</Label>
              <Input
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Mandant E-Mail</Label>
              <Input
                type="email"
                value={form.client_email}
                onChange={(e) => setForm({ ...form, client_email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Typ *</Label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as PowerOfAttorney["type"] })
                }
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
              >
                {Object.entries(POA_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label.de}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Umfang *</Label>
              <Input
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value })}
                placeholder="Z.B. Vertretung im Verfahren XY vor dem AG Berlin"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Ablaufdatum</Label>
              <Input
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="brand-bg gap-2 text-white">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Speichern
          </Button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : poas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] py-16 text-center">
          <FileCheck size={32} className="mb-3 text-[color:var(--ds-text-muted)]" />
          <p className="text-sm font-medium">Keine Vollmachten</p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            Erfassen Sie Vollmachten mit Geltungsdauer und Ablauf-Tracking.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {poas.map((poa) => {
            const valid = isPoAValid(poa);
            const statusLabel = POA_STATUS_LABELS[poa.status];
            const typeLabel = POA_TYPE_LABELS[poa.type];
            return (
              <div
                key={poa.id}
                className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{poa.client_name}</span>
                    <Badge variant="default" className="text-xs">
                      {typeLabel.de}
                    </Badge>
                    <Badge
                      variant="default"
                      className={`text-xs ${valid ? "border-green-500/30 text-green-600" : poa.status === "expired" || poa.status === "revoked" ? "border-red-500/30 text-red-600" : ""}`}
                    >
                      {statusLabel.de}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                    {poa.scope} · Akte: {poa.case_slug}
                  </div>
                  {poa.expires_at && (
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      Ablauf: {poa.expires_at.split("T")[0]}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
