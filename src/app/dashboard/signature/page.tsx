"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FileSignature,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  PenTool,
  Settings,
  ExternalLink,
  Plus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { signatureRequestSchema, type SignatureRequestFormData } from "@/lib/schemas/signature";
import { PageHeader } from "@/components/dashboard/page-header";
import type { BrainPage } from "@/lib/types";
import { useLang } from "@/lib/use-lang";

interface SignatureRequest {
  id: string;
  documentName: string;
  recipientName: string;
  recipientEmail: string;
  status: "draft" | "sent" | "signed" | "declined" | "expired";
  sentAt?: string;
  signedAt?: string;
  expiresAt: string;
}

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
    iconClass: string;
    badgeClass: string;
    tileClass: string;
  }
> = {
  draft: {
    label: "Entwurf",
    icon: PenTool,
    iconClass: "text-gray-400",
    badgeClass: "bg-gray-500/5 border-gray-500/20 text-gray-400",
    tileClass: "bg-gray-500/10",
  },
  sent: {
    label: "Versendet",
    icon: Send,
    iconClass: "text-blue-600",
    badgeClass: "bg-blue-500/5 border-blue-500/20 text-blue-600",
    tileClass: "bg-blue-500/10",
  },
  signed: {
    label: "Unterschrieben",
    icon: CheckCircle2,
    iconClass: "text-emerald-600",
    badgeClass: "bg-emerald-500/5 border-emerald-500/20 text-emerald-600",
    tileClass: "bg-emerald-500/10",
  },
  declined: {
    label: "Abgelehnt",
    icon: XCircle,
    iconClass: "text-red-600",
    badgeClass: "bg-red-500/5 border-red-500/20 text-red-600",
    tileClass: "bg-red-500/10",
  },
  expired: {
    label: "Abgelaufen",
    icon: Clock,
    iconClass: "text-amber-600",
    badgeClass: "bg-amber-500/5 border-amber-500/20 text-amber-600",
    tileClass: "bg-amber-500/10",
  },
};

export default function SignaturePage() {
  const { lang } = useLang();
  const [requests, setRequests] = useState<SignatureRequest[]>([]);
  const [drafts, setDrafts] = useState<BrainPage[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const sigForm = useForm<SignatureRequestFormData>({
    resolver: zodResolver(signatureRequestSchema) as never,
    defaultValues: {
      documentName: "",
      recipientName: "",
      recipientEmail: "",
      expiresDays: "14",
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sigPages, draftPages] = await Promise.all([
          api.brain.listPages({ type: "signature_request", limit: 100 }),
          api.brain
            .listPages({ type: "legal_document", limit: 100 })
            .catch(() => [] as BrainPage[]),
        ]);
        if (cancelled) return;
        setDrafts(draftPages);
        const pages = sigPages;
        if (cancelled) return;
        setRequests(
          pages.map((p) => {
            const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
            return {
              id: p.slug,
              documentName: String(fm.document_name ?? p.title),
              recipientName: String(fm.recipient_name ?? "—"),
              recipientEmail: String(fm.recipient_email ?? "—"),
              status: String(fm.status ?? "draft") as SignatureRequest["status"],
              sentAt: fm.sent_at ? String(fm.sent_at) : undefined,
              signedAt: fm.signed_at ? String(fm.signed_at) : undefined,
              expiresAt: String(fm.expires_at ?? p.created_at),
            };
          })
        );
      } catch {
        setNotice("Signatur-Anfragen konnten nicht geladen werden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createRequest() {
    const isValid = await sigForm.trigger();
    if (!isValid) return;
    const data = sigForm.getValues();
    setSaving(true);
    setNotice(null);
    const now = new Date();
    const slug = `legal/signatures/${now.toISOString().split("T")[0]}-${data.documentName
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/g, "-")
      .slice(0, 60)}`;
    const req: SignatureRequest = {
      id: slug,
      documentName: data.documentName,
      recipientName: data.recipientName,
      recipientEmail: data.recipientEmail,
      status: "draft",
      expiresAt: new Date(Date.now() + parseInt(data.expiresDays) * 86400000).toISOString(),
    };
    try {
      await api.brain.createPage({
        slug,
        title: `Signatur: ${data.documentName.trim()}`,
        type: "signature_request",
        content: `Empfänger: ${data.recipientName} <${data.recipientEmail}>`,
        frontmatter: {
          type: "signature_request",
          document_name: data.documentName.trim(),
          recipient_name: data.recipientName.trim(),
          recipient_email: data.recipientEmail.trim(),
          status: "draft",
          expires_at: req.expiresAt,
          created_at: now.toISOString(),
          provider: "external",
        },
      });
      setRequests([req, ...requests]);
      sigForm.reset({ documentName: "", recipientName: "", recipientEmail: "", expiresDays: "14" });
      setShowCreate(false);
      setNotice("Signatur-Entwurf im Brain gespeichert.");
    } catch (e) {
      setNotice(
        e instanceof Error ? `Speichern fehlgeschlagen: ${e.message}` : "Speichern fehlgeschlagen."
      );
    } finally {
      setSaving(false);
    }
  }

  async function markPrepared(req: SignatureRequest) {
    const sentAt = new Date().toISOString();
    const updated = { ...req, status: "sent" as const, sentAt };
    setRequests(requests.map((r) => (r.id === req.id ? updated : r)));
    try {
      await api.brain.updatePage({
        slug: req.id,
        frontmatter: {
          type: "signature_request",
          document_name: req.documentName,
          recipient_name: req.recipientName,
          recipient_email: req.recipientEmail,
          status: "sent",
          sent_at: sentAt,
          expires_at: req.expiresAt,
          provider: "external",
        },
      });
      setNotice(
        "Als extern versendet markiert. Der tatsächliche Versand erfolgt im Signatur-Provider."
      );
    } catch (e) {
      setNotice(
        e instanceof Error
          ? `Status konnte nicht gespeichert werden: ${e.message}`
          : "Status konnte nicht gespeichert werden."
      );
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="e-Signatur"
        description="Dokumente digital unterschreiben lassen"
        breadcrumbs={[{ label: "Übersicht", href: "/dashboard" }, { label: "e-Signatur" }]}
        actions={
          <div className="flex items-center gap-2">
            <a
              href="/dashboard/settings"
              className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-amber-500/10"
            >
              <Settings size={14} />
              Anbieter konfigurieren
            </a>
            <Button
              variant="primary"
              className="gap-2 bg-indigo-600 text-sm text-white hover:bg-indigo-500"
              onClick={() => setShowCreate(!showCreate)}
            >
              {showCreate ? <XCircle size={14} /> : <Plus size={14} />}
              {showCreate ? "Abbrechen" : "Unterschrift anfordern"}
            </Button>
          </div>
        }
      />

      {/* Setup hint */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-medium text-amber-600">
              Externer Signatur-Provider erforderlich
            </p>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              Subsumio speichert Signatur-Anfragen revisionsfähig im Brain und verfolgt Status. Der
              rechtlich wirksame Versand erfolgt über einen Anbieter wie{" "}
              <a
                href="https://developers.docusign.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                Docusign
              </a>{" "}
              oder ein Kanzlei-Signaturportal. Kein Demo-Versand wird vorgetäuscht.
            </p>
          </div>
        </div>
      </div>

      {notice && (
        <div
          className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-700"
          role="status"
        >
          {notice}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="space-y-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
          <h2 className="text-sm font-semibold text-indigo-600">
            Unterschriften-Anfrage erstellen
          </h2>
          {drafts.length > 0 && (
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                Entwurf auswählen (optional)
              </label>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    const draft = drafts.find((d) => d.slug === e.target.value);
                    if (draft) {
                      sigForm.setValue("documentName", draft.title);
                    }
                  }
                }}
                defaultValue=""
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-indigo-500/50 focus:outline-none"
              >
                <option value="">— Manuell eingeben —</option>
                {drafts.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                Dokument
              </label>
              <input
                {...sigForm.register("documentName")}
                placeholder="z.B. Mandatsvereinbarung Muster GmbH"
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-indigo-500/50 focus:outline-none"
              />
              {sigForm.formState.errors.documentName && (
                <p className="mt-1 text-xs text-red-600">
                  {sigForm.formState.errors.documentName.message}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                Empfänger-Name
              </label>
              <input
                {...sigForm.register("recipientName")}
                placeholder="Max Mustermann"
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-indigo-500/50 focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">E-Mail</label>
              <input
                type="email"
                {...sigForm.register("recipientEmail")}
                placeholder="max@example.com"
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-indigo-500/50 focus:outline-none"
              />
              {sigForm.formState.errors.recipientEmail && (
                <p className="mt-1 text-xs text-red-600">
                  {sigForm.formState.errors.recipientEmail.message}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                Gültigkeit (Tage)
              </label>
              <input
                type="number"
                {...sigForm.register("expiresDays")}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-indigo-500/50 focus:outline-none"
              />
              {sigForm.formState.errors.expiresDays && (
                <p className="mt-1 text-xs text-red-600">
                  {sigForm.formState.errors.expiresDays.message}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              className="gap-2 bg-indigo-600 text-sm text-white hover:bg-indigo-500"
              onClick={createRequest}
              disabled={saving}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <PenTool size={14} />}
              Entwurf speichern
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-indigo-600" />
        </div>
      ) : requests.length === 0 ? (
        <div className="space-y-4 py-20 text-center">
          <FileSignature size={48} className="mx-auto text-[color:var(--ds-border)]" />
          <div>
            <p className="text-[color:var(--ds-text-muted)]">Noch keine Unterschriften-Anfragen.</p>
            <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
              Erstelle eine Anfrage, um Dokumente digital unterschreiben zu lassen.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => {
            const cfg = STATUS_CONFIG[req.status];
            const Icon = cfg.icon;
            return (
              <div
                key={req.id}
                className="flex items-center gap-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-indigo-500/30"
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    cfg.tileClass
                  )}
                >
                  <Icon size={18} className={cfg.iconClass} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[color:var(--ds-text)]">
                      {req.documentName}
                    </span>
                    <Badge variant="default" className={cn("border text-xs", cfg.badgeClass)}>
                      {cfg.label}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                    {req.recipientName} · {req.recipientEmail} · Gültig bis{" "}
                    {new Date(req.expiresAt).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {req.status === "draft" && (
                    <button
                      onClick={() => markPrepared(req)}
                      className="rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-indigo-500/10 hover:text-indigo-600"
                      title="Als extern versendet markieren"
                    >
                      <Send size={14} />
                    </button>
                  )}
                  <a
                    href={`/dashboard/brain/${encodeURIComponent(req.id)}`}
                    className="rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text-muted)]"
                    title="Brain-Seite öffnen"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
