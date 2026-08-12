"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { usePortalVisitEvents } from "@/lib/use-portal-visit-events";
import { SignatureQuickCreateDialog } from "@/components/legal/SignatureQuickCreateDialog";
import { SendLinkDialog } from "@/components/legal/SendLinkDialog";

interface SignatureRequest {
  id: string;
  documentName: string;
  recipientName: string;
  recipientEmail: string;
  recipientPhone?: string;
  caseSlug?: string;
  contactSlug?: string;
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
    label: "sig.status_draft",
    icon: PenTool,
    iconClass: "text-gray-400",
    badgeClass: "bg-gray-500/5 border-gray-500/20 text-gray-400",
    tileClass: "bg-gray-500/10",
  },
  sent: {
    label: "sig.status_sent",
    icon: Send,
    iconClass: "text-[color:var(--ds-info-text)]",
    badgeClass:
      "bg-[color:var(--ds-info-bg)] border-[color:var(--ds-info-border)] text-[color:var(--ds-info-text)]",
    tileClass: "bg-[color:var(--ds-info-bg)]",
  },
  signed: {
    label: "sig.status_signed",
    icon: CheckCircle2,
    iconClass: "text-[color:var(--ds-success-text)]",
    badgeClass:
      "bg-[color:var(--ds-success-bg)] border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]",
    tileClass: "bg-[color:var(--ds-success-bg)]",
  },
  declined: {
    label: "sig.status_declined",
    icon: XCircle,
    iconClass: "text-[color:var(--ds-danger-text)]",
    badgeClass:
      "bg-[color:var(--ds-danger-bg)] border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]",
    tileClass: "bg-[color:var(--ds-danger-bg)]",
  },
  expired: {
    label: "sig.status_expired",
    icon: Clock,
    iconClass: "text-[color:var(--ds-warning-text)]",
    badgeClass:
      "bg-[color:var(--ds-warning-bg)] border-[color:var(--ds-warning-border)] text-[color:var(--ds-warning-text)]",
    tileClass: "bg-[color:var(--ds-warning-bg)]",
  },
};

export default function SignaturePage() {
  const { t, lang } = useLang();
  usePortalVisitEvents();
  const [requests, setRequests] = useState<SignatureRequest[]>([]);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [sendReq, setSendReq] = useState<SignatureRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadRequests() {
    setLoading(true);
    try {
      const sigPages = await api.brain.listPages({ type: "signature_request", limit: 100 });
      setRequests(
        sigPages.map((p) => {
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
          return {
            id: p.slug,
            documentName: String(fm.document_name ?? p.title),
            recipientName: String(fm.recipient_name ?? "—"),
            recipientEmail: String(fm.recipient_email ?? "—"),
            recipientPhone: fm.recipient_phone ? String(fm.recipient_phone) : undefined,
            caseSlug: fm.case_slug ? String(fm.case_slug) : undefined,
            contactSlug: fm.contact_slug ? String(fm.contact_slug) : undefined,
            status: String(fm.status ?? "draft") as SignatureRequest["status"],
            sentAt: fm.sent_at ? String(fm.sent_at) : undefined,
            signedAt: fm.signed_at ? String(fm.signed_at) : undefined,
            expiresAt: String(fm.expires_at ?? p.created_at),
          };
        })
      );
    } catch {
      setNotice(t("sig.err_load"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => setQuickCreateOpen(true);
    window.addEventListener("subsumio:create-signature", handler);
    return () => window.removeEventListener("subsumio:create-signature", handler);
  }, []);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("sig.breadcrumb")}
        description={t("sig.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("sig.breadcrumb") },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/settings"
              className="flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-warning-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:ring-offset-2 sm:min-h-0"
            >
              <Settings size={14} />
              {t("sig.btn_configure")}
            </Link>
            <Button
              variant="primary"
              className="brand-bg gap-2 text-sm text-white"
              onClick={() => setQuickCreateOpen(true)}
            >
              <Plus size={14} />
              {t("signature.btn_request")}
            </Button>
          </div>
        }
      />

      {/* Setup hint */}
      <div className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle
            size={18}
            className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
          />
          <div>
            <p className="text-sm font-medium text-[color:var(--ds-warning-text)]">
              {t("sig.setup_hint_title")}
            </p>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              {t("sig.setup_hint_body")}
            </p>
          </div>
        </div>
      </div>

      {notice && (
        <div
          className="rounded-xl border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] px-4 py-3 text-sm text-[color:var(--ds-info-text)]"
          role="status"
        >
          {notice}
        </div>
      )}

      {/* Quick create dialog */}
      <SignatureQuickCreateDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        onCreated={() => {
          setNotice(t("signature.quick_created"));
          (async () => {
            const sigPages = await api.brain.listPages({ type: "signature_request", limit: 100 });
            setRequests(
              sigPages.map((p) => {
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
          })();
        }}
      />

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20" role="status" aria-live="polite">
          <Loader2 size={24} className="animate-spin text-[color:var(--brand-primary)]" />
        </div>
      ) : requests.length === 0 ? (
        <div className="space-y-4 py-20 text-center">
          <FileSignature size={48} className="mx-auto text-[color:var(--ds-border)]" />
          <div>
            <p className="text-[color:var(--ds-text-muted)]">{t("sig.empty")}</p>
            <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">{t("sig.empty_hint")}</p>
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
                className="flex items-center gap-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[color:var(--brand-primary)]/30"
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
                      {t(cfg.label as never)}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                    {req.recipientName} · {req.recipientEmail} · {t("sig.valid_until")}{" "}
                    {new Date(req.expiresAt).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {req.status === "draft" && (
                    <button
                      onClick={() => setSendReq(req)}
                      disabled={!req.caseSlug}
                      className="rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--brand-primary)]/10 hover:text-[color:var(--brand-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] disabled:opacity-40"
                      title={req.caseSlug ? t("sig.aria_ext_sent") : t("sig.no_case")}
                      aria-label={t("sig.aria_ext_sent")}
                    >
                      <Send size={14} />
                    </button>
                  )}
                  <Link
                    href={`/dashboard/brain/${encodeURIComponent(req.id)}`}
                    className="rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)]"
                    title={t("sig.aria_brain")}
                    aria-label={t("sig.aria_brain")}
                  >
                    <ExternalLink size={14} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sendReq && sendReq.caseSlug && (
        <SendLinkDialog
          open={!!sendReq}
          onOpenChange={(open) => {
            if (!open) setSendReq(null);
          }}
          onSent={() => void loadRequests()}
          caseSlug={sendReq.caseSlug}
          documentSlug={sendReq.id}
          documentTitle={sendReq.documentName}
          documentType="signature_request"
          recipientName={sendReq.recipientName}
          recipientEmail={sendReq.recipientEmail !== "—" ? sendReq.recipientEmail : undefined}
          recipientPhone={sendReq.recipientPhone}
          contactSlug={sendReq.contactSlug}
        />
      )}
    </div>
  );
}
