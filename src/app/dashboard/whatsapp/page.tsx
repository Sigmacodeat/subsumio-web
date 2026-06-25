"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Inbox,
  FileClock,
  Gavel,
  MessageSquareText,
  ArrowRight,
  Receipt,
  CalendarClock,
  ClipboardList,
  FileText,
  FolderInput,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";

interface WhatsAppStatus {
  configured: boolean;
  verifyToken: boolean;
  appSecret: boolean;
  accessToken: boolean;
  phoneNumberId: boolean;
  mediaStorageProvider: string;
  mediaStorageDir: string;
  mediaMaxBytes: number;
  blobConfigured: boolean;
  allowedSenders: Array<{
    brainId: string;
    userId?: string;
    name?: string;
    role?: string;
    phoneLast4: string;
  }>;
  identities: Array<{
    id: string;
    brainId: string;
    userId?: string;
    name?: string;
    role?: string;
    status: string;
    verifiedAt: string | null;
    phoneHash: string;
    phoneLast4: string;
  }>;
  webhookUrl: string;
}

function front(page: BrainPage): Record<string, unknown> {
  return page.frontmatter ?? {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export default function WhatsAppDashboardPage() {
  const { t } = useLang();
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [events, setEvents] = useState<BrainPage[]>([]);
  const [approvals, setApprovals] = useState<BrainPage[]>([]);
  const [intakes, setIntakes] = useState<BrainPage[]>([]);
  const [documentRequests, setDocumentRequests] = useState<BrainPage[]>([]);
  const [timeEntries, setTimeEntries] = useState<BrainPage[]>([]);
  const [documents, setDocuments] = useState<BrainPage[]>([]);
  const [cases, setCases] = useState<BrainPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [identityName, setIdentityName] = useState("");
  const [identityRole, setIdentityRole] = useState<"lawyer" | "assistant" | "client" | "intake">(
    "lawyer"
  );
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [assigningSlug, setAssigningSlug] = useState<string | null>(null);
  const [caseSelections, setCaseSelections] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        statusRes,
        eventPages,
        approvalPages,
        intakePages,
        requestPages,
        timePages,
        docPages,
        casePages,
      ] = await Promise.all([
        api.whatsapp.status().catch(() => null),
        api.brain.listPages({ type: "conversation_event", limit: 100 }).catch(() => []),
        api.brain.listPages({ type: "agent_action", limit: 100 }).catch(() => []),
        api.brain.listPages({ type: "intake_request", limit: 100 }).catch(() => []),
        api.brain.listPages({ type: "document_request", limit: 100 }).catch(() => []),
        api.brain.listPages({ type: "time_entry", limit: 100 }).catch(() => []),
        api.brain.listPages({ type: "legal_document", limit: 200 }).catch(() => []),
        api.brain.listPages({ type: "legal_case", limit: 200 }).catch(() => []),
      ]);
      setStatus(statusRes);
      setEvents(eventPages.filter((page) => front(page).channel === "whatsapp"));
      setApprovals(
        approvalPages.filter((page) =>
          text(front(page).source_event_slug).includes("legal/conversations/whatsapp")
        )
      );
      setIntakes(
        intakePages.filter(
          (page) =>
            text(front(page).source_event_slug).includes("legal/conversations/whatsapp") ||
            front(page).source === "whatsapp"
        )
      );
      setDocumentRequests(
        requestPages.filter(
          (page) =>
            text(front(page).source_event_slug).includes("legal/conversations/whatsapp") ||
            front(page).channel === "whatsapp"
        )
      );
      setTimeEntries(
        timePages.filter(
          (page) =>
            text(front(page).source_event_slug).includes("legal/conversations/whatsapp") ||
            front(page).source === "whatsapp" ||
            text(front(page).channel) === "whatsapp"
        )
      );
      setDocuments(docPages.filter((page) => front(page).source === "whatsapp"));
      setCases(casePages);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("whatsapp.err_load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reload();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function addIdentity() {
    if (!phone.trim()) return;
    setSavingIdentity(true);
    setError(null);
    try {
      await api.whatsapp.createIdentity({
        phone: phone.trim(),
        name: identityName.trim() || undefined,
        role: identityRole,
        status: "active",
        matter_scope: "all",
      });
      setPhone("");
      setIdentityName("");
      setIdentityRole("lawyer");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("whatsapp.err_save_identity"));
    } finally {
      setSavingIdentity(false);
    }
  }

  async function assignDocumentToCase(document: BrainPage, caseSlug: string) {
    if (!caseSlug) return;
    setAssigningSlug(document.slug);
    setError(null);
    try {
      const casePage = await api.brain.getPage(caseSlug);
      const caseFm = front(casePage);
      const existingDocs = Array.isArray(caseFm.documents)
        ? (caseFm.documents as Array<Record<string, unknown>>)
        : [];
      const alreadyLinked = existingDocs.some((doc) => text(doc.slug) === document.slug);
      const docFm = front(document);
      const now = new Date().toISOString();

      await api.brain.updatePage({
        slug: document.slug,
        title: document.title,
        type: document.type || "legal_document",
        frontmatter: {
          case_slug: casePage.slug,
          case_title: casePage.title,
          assignment_status: "assigned",
          analysis_status: "pending",
          review_status: "needs_review",
          assigned_at: now,
          assigned_from: "whatsapp_triage",
        },
      });

      if (!alreadyLinked) {
        await api.brain.updatePage({
          slug: casePage.slug,
          title: casePage.title,
          type: casePage.type || "legal_case",
          frontmatter: {
            documents: [
              ...existingDocs,
              {
                id: `${Date.now()}`,
                title: document.title,
                slug: document.slug,
                type: text(docFm.document_kind) || text(docFm.mime_type) || "document",
                source: "whatsapp",
                storage_path: text(docFm.storage_path),
                mime_type: text(docFm.mime_type),
                size: Number(docFm.size ?? 0) || undefined,
                uploaded_at: text(docFm.uploaded_at) || now,
              },
            ],
            audit_log: [
              ...(Array.isArray(caseFm.audit_log)
                ? (caseFm.audit_log as Array<Record<string, unknown>>)
                : []),
              {
                id: `${Date.now()}-whatsapp-doc`,
                at: now,
                action: "updated",
                actor: "WhatsApp-Triage",
                field: "documents",
                note: `WhatsApp-Dokument zugeordnet: ${document.title}`,
              },
            ],
          },
        });
      }

      api.legal
        .analyzeDocument({ document_slug: document.slug })
        .then(() =>
          api.brain.updatePage({
            slug: document.slug,
            title: document.title,
            type: document.type || "legal_document",
            frontmatter: {
              analysis_status: "analyzed",
              analyzed_at: new Date().toISOString(),
            },
          })
        )
        .catch(() =>
          api.brain.updatePage({
            slug: document.slug,
            title: document.title,
            type: document.type || "legal_document",
            frontmatter: {
              analysis_status: "failed",
              analysis_failed_at: new Date().toISOString(),
            },
          })
        )
        .catch(() => {});

      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("whatsapp.err_assign_document"));
    } finally {
      setAssigningSlug(null);
    }
  }

  const pendingApprovals = useMemo(
    () => approvals.filter((page) => front(page).status === "pending").length,
    [approvals]
  );
  const openIntakes = useMemo(
    () =>
      intakes.filter((page) => !["converted", "rejected"].includes(text(front(page).status)))
        .length,
    [intakes]
  );
  const openDocumentRequests = useMemo(
    () =>
      documentRequests.filter(
        (page) => !["fulfilled", "expired"].includes(text(front(page).status))
      ).length,
    [documentRequests]
  );
  const unassignedDocuments = useMemo(
    () =>
      documents.filter((page) => {
        const fm = front(page);
        return (
          fm.assignment_status === "pending_assignment" ||
          (!text(fm.case_slug) && fm.source === "whatsapp")
        );
      }),
    [documents]
  );
  const pendingTimeApprovals = useMemo(
    () =>
      approvals.filter(
        (page) => front(page).status === "pending" && front(page).action_type === "booking_create"
      ).length,
    [approvals]
  );
  const whatsappMinutes = useMemo(
    () =>
      timeEntries.reduce((sum, page) => {
        const minutes = Number(front(page).minutes ?? 0);
        return Number.isFinite(minutes) ? sum + minutes : sum;
      }, 0),
    [timeEntries]
  );
  const activeThreads = useMemo(() => {
    const set = new Set<string>();
    events.forEach((page) => {
      const fm = front(page);
      const sender = text(fm.phone_hash) || text(fm.sender_phone_hash) || text(fm.from_phone_hash);
      if (sender) set.add(sender);
    });
    return set.size;
  }, [events]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("whatsapp.title")}
        description={t("whatsapp.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("whatsapp.breadcrumb") },
        ]}
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[color:var(--ds-text-muted)]">
          <Loader2 size={20} className="mr-2 animate-spin" /> {t("whatsapp.loading")}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Metric
              label={t("whatsapp.metric_config")}
              value={status?.configured ? t("whatsapp.metric_ready") : t("whatsapp.metric_open")}
              ok={Boolean(status?.configured)}
            />
            <Metric
              label={t("whatsapp.metric_pending_approvals")}
              value={String(pendingApprovals)}
              warn={pendingApprovals > 0}
            />
            <Metric
              label={t("whatsapp.metric_open_intakes")}
              value={String(openIntakes)}
              warn={openIntakes > 0}
            />
            <Metric
              label={t("whatsapp.metric_open_docs")}
              value={String(openDocumentRequests + unassignedDocuments.length)}
              warn={openDocumentRequests + unassignedDocuments.length > 0}
            />
            <Metric
              label={t("whatsapp.metric_time")}
              value={
                pendingTimeApprovals > 0
                  ? String(pendingTimeApprovals)
                  : whatsappMinutes > 0
                    ? `${whatsappMinutes} min`
                    : "0"
              }
              warn={pendingTimeApprovals > 0}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <WorkflowLink
              href="/dashboard/intake"
              icon={Inbox}
              title={t("whatsapp.intake")}
              value={String(openIntakes)}
              text={t("whatsapp.intake_desc")}
            />
            <WorkflowLink
              href="/dashboard/document-requests"
              icon={FileClock}
              title={t("whatsapp.doc_requests")}
              value={String(openDocumentRequests)}
              text={t("whatsapp.doc_requests_desc")}
            />
            <WorkflowLink
              href="/dashboard/approvals"
              icon={Gavel}
              title={t("whatsapp.approvals")}
              value={String(pendingApprovals)}
              text={t("whatsapp.approvals_desc")}
            />
            <WorkflowLink
              href="/dashboard/invoicing"
              icon={Receipt}
              title={t("whatsapp.time_tracking")}
              value={pendingTimeApprovals > 0 ? String(pendingTimeApprovals) : `${whatsappMinutes}`}
              text={t("whatsapp.time_tracking_desc")}
            />
          </div>

          <WhatsAppDocumentTriage
            documents={unassignedDocuments}
            cases={cases}
            selections={caseSelections}
            assigningSlug={assigningSlug}
            onSelect={(docSlug, caseSlug) =>
              setCaseSelections((current) => ({ ...current, [docSlug]: caseSlug }))
            }
            onAssign={(doc) => assignDocumentToCase(doc, caseSelections[doc.slug] || "")}
          />

          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {t("whatsapp.secretary_title")}
                </h2>
                <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                  {t("whatsapp.secretary_desc")}
                </p>
              </div>
              <Badge
                variant="default"
                className="border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-600"
              >
                {activeThreads} {t("whatsapp.active_threads")}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <SecretaryCapability
                icon={Inbox}
                label={t("whatsapp.cap_intake")}
                status={t("whatsapp.cap_active")}
              />
              <SecretaryCapability
                icon={FileClock}
                label={t("whatsapp.cap_docs")}
                status={t("whatsapp.cap_active")}
              />
              <SecretaryCapability
                icon={Receipt}
                label={t("whatsapp.cap_time")}
                status={t("whatsapp.cap_approval")}
              />
              <SecretaryCapability
                icon={CalendarClock}
                label={t("whatsapp.cap_deadlines")}
                status={t("whatsapp.cap_approval")}
              />
              <SecretaryCapability
                icon={ClipboardList}
                label={t("whatsapp.cap_notes")}
                status={t("whatsapp.cap_active")}
              />
              <SecretaryCapability
                icon={Gavel}
                label={t("whatsapp.cap_send")}
                status={t("whatsapp.cap_approval")}
              />
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-600" />
              <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("whatsapp.phone_numbers")}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1.2fr_1fr_160px_auto]">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("whatsapp.phone_placeholder")}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
              />
              <input
                value={identityName}
                onChange={(e) => setIdentityName(e.target.value)}
                placeholder={t("whatsapp.name_placeholder")}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
              />
              <select
                value={identityRole}
                onChange={(e) => setIdentityRole(e.target.value as typeof identityRole)}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
              >
                <option value="lawyer">{t("whatsapp.role_lawyer")}</option>
                <option value="assistant">{t("whatsapp.role_assistant")}</option>
                <option value="client">{t("whatsapp.role_client")}</option>
                <option value="intake">{t("whatsapp.role_intake")}</option>
              </select>
              <Button onClick={() => void addIdentity()} disabled={savingIdentity || !phone.trim()}>
                {savingIdentity ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                {t("whatsapp.activate")}
              </Button>
            </div>
            {status?.identities?.length ? (
              <div className="space-y-2">
                {status.identities.map((identity) => (
                  <div
                    key={identity.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[color:var(--ds-text)]">
                        {identity.name || t("whatsapp.identity_default")} ·{" "}
                        {identity.phoneLast4
                          ? `****${identity.phoneLast4}`
                          : identity.phoneHash.slice(0, 10)}
                      </div>
                      <div className="text-[color:var(--ds-text-muted)]">
                        {identity.role} · {identity.status} ·{" "}
                        {identity.verifiedAt ? t("whatsapp.verified") : t("whatsapp.not_verified")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void api.whatsapp
                            .updateIdentity({
                              id: identity.id,
                              status: identity.status === "active" ? "suspended" : "active",
                            })
                            .then(() => reload())
                        }
                      >
                        {identity.status === "active"
                          ? t("whatsapp.suspend")
                          : t("whatsapp.activate")}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          void api.whatsapp.deleteIdentity(identity.id).then(() => reload())
                        }
                      >
                        {t("whatsapp.delete")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-600">{t("whatsapp.no_identities")}</p>
            )}
          </div>

          <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-600" />
              <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("whatsapp.setup")}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
              <SetupFlag label="Verify Token" ok={Boolean(status?.verifyToken)} />
              <SetupFlag label="App Secret" ok={Boolean(status?.appSecret)} />
              <SetupFlag label="Access Token" ok={Boolean(status?.accessToken)} />
              <SetupFlag label="Phone ID" ok={Boolean(status?.phoneNumberId)} />
              <SetupFlag label="Allowlist" ok={(status?.allowedSenders.length || 0) > 0} />
            </div>
            <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
              <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
                <span className="text-[color:var(--ds-text-muted)]">
                  {t("whatsapp.storage_provider")}
                </span>
                <div className="mt-1 text-[color:var(--ds-text)]">
                  {status?.mediaStorageProvider || "local"}
                </div>
              </div>
              <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
                <span className="text-[color:var(--ds-text-muted)]">
                  {t("whatsapp.media_storage")}
                </span>
                <div className="mt-1 font-mono break-all text-[color:var(--ds-text)]">
                  {status?.mediaStorageDir || ".data/whatsapp-media"}
                </div>
              </div>
              <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
                <span className="text-[color:var(--ds-text-muted)]">
                  {t("whatsapp.media_limit")}
                </span>
                <div className="mt-1 text-[color:var(--ds-text)]">
                  {Math.round((status?.mediaMaxBytes || 0) / 1024 / 1024)} {t("whatsapp.per_file")}
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 font-mono text-xs break-all text-[color:var(--ds-text-muted)]">
              {status?.webhookUrl || "/api/whatsapp/webhook"}
            </div>
            {status?.allowedSenders?.length ? (
              <div className="space-y-2">
                {status.allowedSenders.map((sender, idx) => (
                  <div
                    key={`${sender.brainId}-${idx}`}
                    className="flex items-center justify-between rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs"
                  >
                    <span className="text-[color:var(--ds-text)]">
                      {sender.name || t("whatsapp.allowed_sender")} · ****{sender.phoneLast4}
                    </span>
                    <span className="text-[color:var(--ds-text-muted)]">{sender.brainId}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-600">{t("whatsapp.no_senders")}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LogPanel title={t("whatsapp.events_log")} pages={events} />
            <WorkflowPanel
              approvals={approvals}
              intakes={intakes}
              documentRequests={documentRequests}
            />
          </div>
        </>
      )}
    </div>
  );
}

function WhatsAppDocumentTriage({
  documents,
  cases,
  selections,
  assigningSlug,
  onSelect,
  onAssign,
}: {
  documents: BrainPage[];
  cases: BrainPage[];
  selections: Record<string, string>;
  assigningSlug: string | null;
  onSelect: (docSlug: string, caseSlug: string) => void;
  onAssign: (doc: BrainPage) => void;
}) {
  const { t, lang } = useLang();

  return (
    <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-600">
            <FolderInput size={17} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("whatsapp.triage_title")}
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-[color:var(--ds-text-muted)]">
              {t("whatsapp.triage_desc")}
            </p>
          </div>
        </div>
        <Badge
          variant="default"
          className={
            documents.length > 0
              ? "border-amber-500/20 bg-amber-500/10 text-xs text-amber-600"
              : "border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-600"
          }
        >
          {documents.length} {t("whatsapp.triage_open")}
        </Badge>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-4 py-5 text-sm text-[color:var(--ds-text-muted)]">
          {t("whatsapp.triage_empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {documents.slice(0, 12).map((doc) => {
            const fm = front(doc);
            const selected = selections[doc.slug] || "";
            const busy = assigningSlug === doc.slug;
            return (
              <div
                key={doc.slug}
                className="grid gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 md:grid-cols-[1fr_260px_auto]"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText size={15} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                    <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {doc.title}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                    <span>{text(fm.document_kind) || text(fm.mime_type) || "WhatsApp"}</span>
                    {Number(fm.size ?? 0) > 0 && <span>{formatBytes(Number(fm.size))}</span>}
                    {text(fm.uploaded_at) && (
                      <span>{new Date(text(fm.uploaded_at)).toLocaleString(lang)}</span>
                    )}
                    <span className="text-amber-600">{t("whatsapp.triage_needs_case")}</span>
                  </div>
                </div>
                <select
                  value={selected}
                  onChange={(event) => onSelect(doc.slug, event.target.value)}
                  className="min-h-10 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 text-sm text-[color:var(--ds-text)]"
                >
                  <option value="">{t("whatsapp.triage_select_case")}</option>
                  {cases.map((casePage) => (
                    <option key={casePage.slug} value={casePage.slug}>
                      {casePage.title}
                    </option>
                  ))}
                </select>
                <Button onClick={() => onAssign(doc)} disabled={!selected || busy}>
                  {busy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FolderInput size={14} />
                  )}
                  {t("whatsapp.triage_assign")}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  ok,
  warn,
}: {
  label: string;
  value: string;
  ok?: boolean;
  warn?: boolean;
}) {
  const color = ok ? "text-emerald-600" : warn ? "text-amber-600" : "text-[color:var(--ds-text)]";
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function SetupFlag({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
      {ok ? (
        <CheckCircle2 size={12} className="text-emerald-600" />
      ) : (
        <XCircle size={12} className="text-red-600" />
      )}
      <span className="text-[color:var(--ds-text-muted)]">{label}</span>
    </div>
  );
}

function SecretaryCapability({
  icon: Icon,
  label,
  status,
}: {
  icon: typeof Inbox;
  label: string;
  status: string;
}) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Icon size={15} className="brand-text shrink-0" />
        <span className="truncate text-xs font-medium text-[color:var(--ds-text)]">{label}</span>
      </div>
      <Badge
        variant="default"
        className="shrink-0 border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-xs text-[color:var(--ds-text-muted)]"
      >
        {status}
      </Badge>
    </div>
  );
}

function WorkflowLink({
  href,
  icon: Icon,
  title,
  value,
  text,
}: {
  href: string;
  icon: typeof Inbox;
  title: string;
  value: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-colors hover:bg-[color:var(--ds-surface-hover)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--ds-border)]">
            <Icon size={16} className="brand-text" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[color:var(--ds-text)]">{title}</div>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">{text}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-[color:var(--ds-text)]">{value}</span>
          <ArrowRight
            size={14}
            className="text-[color:var(--ds-text-muted)] transition-transform group-hover:translate-x-0.5"
          />
        </div>
      </div>
    </Link>
  );
}

function WorkflowPanel({
  approvals,
  intakes,
  documentRequests,
}: {
  approvals: BrainPage[];
  intakes: BrainPage[];
  documentRequests: BrainPage[];
}) {
  const { t } = useLang();
  const rows = [
    ...approvals.map((page) => ({
      page,
      kind: t("whatsapp.kind_approval"),
      href: "/dashboard/approvals",
    })),
    ...intakes.map((page) => ({
      page,
      kind: t("whatsapp.kind_intake"),
      href: "/dashboard/intake",
    })),
    ...documentRequests.map((page) => ({
      page,
      kind: t("whatsapp.kind_docs"),
      href: "/dashboard/document-requests",
    })),
  ]
    .sort((a, b) => new Date(b.page.created_at).getTime() - new Date(a.page.created_at).getTime())
    .slice(0, 20);

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
      <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
        {t("whatsapp.workflow_objects")}
      </h2>
      {rows.length === 0 ? (
        <p className="py-6 text-sm text-[color:var(--ds-text-muted)]">
          {t("whatsapp.no_workflow")}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map(({ page, kind, href }) => {
            const fm = front(page);
            return (
              <Link
                key={`${kind}-${page.slug}`}
                href={href}
                className="block rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 hover:bg-[color:var(--ds-surface-hover)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <MessageSquareText
                      size={12}
                      className="shrink-0 text-[color:var(--ds-text-muted)]"
                    />
                    <span className="truncate text-xs font-medium text-[color:var(--ds-text)]">
                      {page.title}
                    </span>
                  </div>
                  <Badge
                    variant="default"
                    className="brand-border brand-soft brand-text border text-xs"
                  >
                    {kind}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                  {text(fm.status) ||
                    text(fm.action_type) ||
                    text(fm.channel) ||
                    t("whatsapp.status_open")}
                  {text(fm.source_event_slug) && <span> · {text(fm.source_event_slug)}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LogPanel({ title, pages }: { title: string; pages: BrainPage[] }) {
  const { t, lang } = useLang();
  const [viewMode, setViewMode] = useState<"flat" | "threads">("flat");
  const [selectedThread, setSelectedThread] = useState<string | null>(null);

  const sorted = [...pages]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);

  // Group by the normalized sender hash used by conversation_event/chat_inbox pages.
  const threads = useMemo(() => {
    const map = new Map<
      string,
      { senderHash: string; senderName: string; events: BrainPage[]; lastAt: string }
    >();
    for (const page of sorted) {
      const fm = front(page);
      const senderHash =
        text(fm.phone_hash) || text(fm.sender_phone_hash) || text(fm.from_phone_hash) || "unknown";
      const senderName = text(fm.sender_name) || text(fm.sender) || `****${senderHash.slice(-4)}`;
      const existing = map.get(senderHash);
      if (existing) {
        existing.events.push(page);
        if (new Date(page.created_at) > new Date(existing.lastAt)) {
          existing.lastAt = page.created_at;
        }
      } else {
        map.set(senderHash, { senderHash, senderName, events: [page], lastAt: page.created_at });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    );
  }, [sorted]);

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">{title}</h2>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode("flat")}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              viewMode === "flat"
                ? "bg-blue-600/15 text-blue-600"
                : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            }`}
          >
            Liste
          </button>
          <button
            onClick={() => setViewMode("threads")}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              viewMode === "threads"
                ? "bg-blue-600/15 text-blue-600"
                : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            }`}
          >
            Threads
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="py-6 text-sm text-[color:var(--ds-text-muted)]">{t("whatsapp.no_entries")}</p>
      ) : viewMode === "flat" ? (
        <div className="space-y-2">
          {sorted.slice(0, 20).map((page) => {
            const fm = front(page);
            const status = text(fm.status) || text(fm.intent) || "received";
            return (
              <div
                key={page.slug}
                className="space-y-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-xs font-medium text-[color:var(--ds-text)]">
                    {page.title}
                  </div>
                  <Badge
                    variant="default"
                    className="brand-border brand-soft brand-text border text-xs"
                  >
                    {status}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                  <Clock size={10} />{" "}
                  {new Date(page.created_at).toLocaleString(lang === "en" ? "en-GB" : "de-DE")}
                  {text(fm.intent) && <span> · {text(fm.intent)}</span>}
                </div>
                {text(fm.error) && (
                  <div className="flex items-center gap-1 text-xs text-red-700">
                    <AlertTriangle size={10} /> {text(fm.error)}
                  </div>
                )}
                {page.content && (
                  <p className="line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                    {page.content}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-3" style={{ minHeight: "300px" }}>
          {/* Thread list */}
          <div className="w-1/2 space-y-1 overflow-y-auto" style={{ maxHeight: "400px" }}>
            {threads.map((thread) => (
              <button
                key={thread.senderHash}
                onClick={() => setSelectedThread(thread.senderHash)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                  selectedThread === thread.senderHash
                    ? "border-blue-500/30 bg-blue-600/10"
                    : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:bg-[color:var(--ds-surface-hover)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-[color:var(--ds-text)]">
                    {thread.senderName}
                  </span>
                  <span className="shrink-0 text-xs text-[color:var(--ds-text-muted)]">
                    {thread.events.length}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-[color:var(--ds-text-muted)]">
                  {new Date(thread.lastAt).toLocaleString(lang === "en" ? "en-GB" : "de-DE")}
                </div>
              </button>
            ))}
          </div>

          {/* Thread messages */}
          <div className="w-1/2 space-y-2 overflow-y-auto" style={{ maxHeight: "400px" }}>
            {selectedThread ? (
              (() => {
                const thread = threads.find((t) => t.senderHash === selectedThread);
                if (!thread) return null;
                return thread.events
                  .sort(
                    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                  )
                  .map((page) => {
                    const fm = front(page);
                    const status = text(fm.status) || text(fm.intent) || "received";
                    return (
                      <div
                        key={page.slug}
                        className="space-y-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge
                            variant="default"
                            className="brand-border brand-soft brand-text border text-xs"
                          >
                            {status}
                          </Badge>
                          <span className="text-xs text-[color:var(--ds-text-muted)]">
                            {new Date(page.created_at).toLocaleTimeString(
                              lang === "en" ? "en-GB" : "de-DE"
                            )}
                          </span>
                        </div>
                        {page.content && (
                          <p className="text-xs text-[color:var(--ds-text)]">
                            {page.content.slice(0, 200)}
                          </p>
                        )}
                        {text(fm.intent) && (
                          <div className="text-xs text-[color:var(--ds-text-muted)]">
                            Intent: {text(fm.intent)}
                          </div>
                        )}
                      </div>
                    );
                  });
              })()
            ) : (
              <p className="py-6 text-center text-xs text-[color:var(--ds-text-muted)]">
                Thread auswählen
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
