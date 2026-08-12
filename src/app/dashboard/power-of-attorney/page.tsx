"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Loader2, FileCheck, AlertTriangle, FileDown, PenTool, Send } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { usePortalVisitEvents } from "@/lib/use-portal-visit-events";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import type { PowerOfAttorney } from "@/lib/power-of-attorney";
import { POA_TYPE_LABELS, POA_STATUS_LABELS, isPoAValid } from "@/lib/power-of-attorney";
import { SignatureDialog } from "@/components/legal/SignatureDialog";
import { SendLinkDialog } from "@/components/legal/SendLinkDialog";

export default function PowerOfAttorneyPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  usePortalVisitEvents();
  const searchParams = useSearchParams();
  const [poas, setPoas] = useState<PowerOfAttorney[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signPoa, setSignPoa] = useState<PowerOfAttorney | null>(null);
  const [sendPoa, setSendPoa] = useState<PowerOfAttorney | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);
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
      addToast({ type: "error", title: t("poa.err_required") });
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
      addToast({ type: "success", title: t("poa.ok_create") });
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
        title: t("poa.err_save"),
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

  async function handleGeneratePdf(poa: PowerOfAttorney) {
    setGeneratingPdf(poa.id);
    try {
      const res = await csrfFetch("/api/power-of-attorney/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poa_id: poa.id }),
      });
      const data = await res.json();
      if (data.ok && data.pdf_base64) {
        const link = document.createElement("a");
        link.href = `data:application/pdf;base64,${data.pdf_base64}`;
        link.download = `vollmacht-${poa.id}.pdf`;
        link.click();
        addToast({ type: "success", title: t("poa.pdf_generated") });
        void load();
      } else {
        addToast({ type: "error", title: t("poa.pdf_error") });
      }
    } catch (e) {
      addToast({
        type: "error",
        title: t("poa.pdf_error"),
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setGeneratingPdf(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("poa.title")}
        description={t("poa.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("poa.title") },
        ]}
        actions={
          <Button onClick={() => setShowCreate(!showCreate)} className="brand-bg gap-2 text-white">
            <Plus size={16} /> {t("poa.btn_create")}
          </Button>
        }
      />

      {expiringCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] px-4 py-3">
          <AlertTriangle
            size={16}
            className="mt-0.5 shrink-0 text-[color:var(--ds-attention-text)]"
          />
          <p className="text-sm text-[color:var(--ds-attention-text)]">
            <strong>{expiringCount}</strong> {t("poa.expiring_warn")}
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
          <h2 className="text-sm font-semibold">{t("poa.create_title")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="poa-case" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("poa.fld_case")} *
              </Label>
              <Input
                id="poa-case"
                value={form.case_slug}
                onChange={(e) => setForm({ ...form, case_slug: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="poa-client" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("poa.fld_client")} *
              </Label>
              <Input
                id="poa-client"
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="poa-email" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("poa.fld_client_email")}
              </Label>
              <Input
                id="poa-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={form.client_email}
                onChange={(e) => setForm({ ...form, client_email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="poa-type" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("poa.fld_type")} *
              </Label>
              <select
                id="poa-type"
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
              <Label htmlFor="poa-scope" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("poa.fld_scope")} *
              </Label>
              <Input
                id="poa-scope"
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value })}
                placeholder={t("poa.fld_scope_ph")}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="poa-expires" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("poa.fld_expires")}
              </Label>
              <Input
                id="poa-expires"
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="brand-bg gap-2 text-white">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t("poa.btn_save")}
          </Button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-20" role="status" aria-live="polite">
          <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : poas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] py-16 text-center">
          <FileCheck size={32} className="mb-3 text-[color:var(--ds-text-muted)]" />
          <p className="text-sm font-medium">{t("poa.empty")}</p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">{t("poa.empty_hint")}</p>
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
                      className={`text-xs ${valid ? "border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]" : poa.status === "expired" || poa.status === "revoked" ? "border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]" : ""}`}
                    >
                      {statusLabel.de}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                    {poa.scope} · {t("poa.scope_label")}: {poa.case_slug}
                  </div>
                  {poa.expires_at && (
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("poa.expires_label")}: {poa.expires_at.split("T")[0]}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleGeneratePdf(poa)}
                    disabled={generatingPdf === poa.id}
                    className="gap-1.5 active:scale-[0.98]"
                    aria-label={t("poa.btn_pdf_aria")}
                    title={t("poa.btn_pdf")}
                  >
                    {generatingPdf === poa.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <FileDown size={14} />
                    )}
                    <span className="hidden sm:inline">{t("poa.btn_pdf")}</span>
                  </Button>
                  {poa.status !== "signed" && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSendPoa(poa)}
                        className="gap-1.5 active:scale-[0.98]"
                        aria-label={poa.status === "sent" ? t("poa.btn_resend_aria") : t("poa.btn_send_aria")}
                        title={poa.status === "sent" ? t("poa.btn_resend") : t("poa.btn_send")}
                      >
                        <Send size={14} />
                        <span className="hidden sm:inline">
                          {poa.status === "sent" ? t("poa.btn_resend") : t("poa.btn_send")}
                        </span>
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSignPoa(poa)}
                        className="gap-1.5 active:scale-[0.98]"
                        aria-label={t("poa.btn_sign_aria")}
                        title={t("poa.btn_sign")}
                      >
                        <PenTool size={14} />
                        <span className="hidden sm:inline">{t("poa.btn_sign")}</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {signPoa && (
        <SignatureDialog
          open={!!signPoa}
          onOpenChange={(open) => !open && setSignPoa(null)}
          documentSlug={`legal/poa/${signPoa.id}`}
          documentType="power_of_attorney"
          documentTitle={`Vollmacht: ${signPoa.client_name} (${POA_TYPE_LABELS[signPoa.type].de})`}
          signerName={signPoa.client_name}
          signerEmail={signPoa.client_email}
          legalLevel="simple"
          onSigned={() => {
            void load();
          }}
        />
      )}

      {sendPoa && (
        <SendLinkDialog
          open={!!sendPoa}
          onOpenChange={(open) => !open && setSendPoa(null)}
          onSent={() => void load()}
          caseSlug={sendPoa.case_slug}
          documentSlug={`legal/poa/${sendPoa.id}`}
          documentTitle={`Vollmacht: ${sendPoa.client_name} (${POA_TYPE_LABELS[sendPoa.type].de})`}
          documentType="power_of_attorney"
          recipientName={sendPoa.client_name}
          recipientEmail={sendPoa.client_email}
        />
      )}
    </div>
  );
}
