"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useLang } from "@/lib/use-lang";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  User,
  ListTree,
  Wand2,
} from "lucide-react";
import {
  useAgents,
  useAgentInbox,
  useSendInboxMessage,
  usePauseAgent,
  useResumeAgent,
  useCancelAgent,
  useReplayAgent,
  useSubmitSupervisor,
  type AgentJob,
} from "@/lib/queries/agents";
import type { TFunc } from "@/content/dashboard";
import { AgentBuilder } from "@/components/dashboard/agent-builder";
import { PageHeader } from "@/components/dashboard/page-header";
import { GroundedOutputPanel } from "@/components/legal/GroundedOutputPanel";
import { useToast } from "@/components/ui/toast";

// ── Helpers ──────────────────────────────────────────────────

/** Fachliche Bezeichnung je Teilaufgabe statt interner Kennungen (legal-researcher …). */
const SPECIALIST_LABELS: Record<string, string> = {
  "legal-researcher": "Recherche",
  "legal-analyst": "Fallanalyse",
  "legal-strategist": "Strategie",
  "legal-drafter": "Schriftsatzentwurf",
  "legal-deadline-extractor": "Fristen-Erkennung",
  "legal-critic": "Qualitätsprüfung",
};

function jobLabel(job: Pick<AgentJob, "name" | "subagentDef">): string {
  if (job.name === "supervisor") return "Gesamtauftrag";
  if (job.subagentDef) return SPECIALIST_LABELS[job.subagentDef] ?? "Teilaufgabe";
  return "Teilaufgabe";
}

function formatInboxPayload(payload: unknown, t: TFunc): string {
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object" || payload === null) return String(payload ?? "");

  const p = payload as Record<string, unknown>;

  if (p.type === "child_done") {
    const childId = p.child_id ?? "?";
    const outcome =
      p.outcome === "complete"
        ? t("agents.outcome_complete")
        : p.outcome === "failed"
          ? t("agents.outcome_failed")
          : t("agents.outcome_unknown");
    return `Teilaufgabe #${childId} ${outcome}.`;
  }

  if (p.type === "cancelled") return "Auftrag abgebrochen.";
  if (p.type === "timeout") return `${t("agents.inbox_timeout")}.`;

  // Freitext-Felder übernehmen; strukturierte Rohdaten nie als JSON anzeigen.
  for (const key of ["text", "message", "content", "summary"]) {
    if (typeof p[key] === "string" && (p[key] as string).trim()) return p[key] as string;
  }
  return "Statusmeldung des Assistenten.";
}

/** Ergebnistext für die Anzeige; rohe Datenstrukturen werden nicht ausgegeben. */
function readableResult(result: string | undefined): string | null {
  if (!result) return null;
  const trimmed = result.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      for (const key of ["answer", "text", "summary", "result", "content", "output"]) {
        if (typeof obj[key] === "string" && (obj[key] as string).trim()) {
          return (obj[key] as string).trim();
        }
      }
    }
  } catch {
    // not JSON — fall through
  }
  return null;
}

// ── Status Helpers ───────────────────────────────────────────

function statusColor(status: AgentJob["status"]): string {
  switch (status) {
    case "completed":
      return "bg-[color:var(--ds-success-solid)]";
    case "active":
      return "bg-[color:var(--ds-info-solid)] animate-pulse";
    case "waiting":
      return "bg-[color:var(--ds-warning-solid)]";
    case "failed":
      return "bg-[color:var(--ds-danger-solid)]";
    case "paused":
      return "bg-[color:var(--ds-neutral-text)]";
    case "partial_success":
      return "bg-[color:var(--ds-warning-solid)]";
    case "needs_review":
      return "bg-[color:var(--ds-attention-solid)]";
    case "monitoring":
      return "bg-[color:var(--ds-info-solid)]";
    default:
      return "bg-[color:var(--ds-neutral-text)]";
  }
}

// SVG `fill`/`stroke` ignore Tailwind's `bg-*` utilities (those only set
// `background-color`, which has no effect on SVG paint), so the graph
// below needs its own color mapping onto the same design tokens
// `statusColor` uses conceptually — kept as CSS var references so a
// theme/token change still propagates here.
function statusFill(status: AgentJob["status"]): string {
  switch (status) {
    case "completed":
      return "var(--color-success)";
    case "active":
      return "var(--color-info)";
    case "waiting":
      return "var(--color-warning)";
    case "failed":
      return "var(--color-danger)";
    case "partial_success":
    case "needs_review":
      return "var(--color-warning)";
    case "monitoring":
      return "var(--color-info)";
    default:
      return "var(--ds-text-muted)";
  }
}

function statusLabel(status: AgentJob["status"], t: TFunc): string {
  switch (status) {
    case "completed":
      return t("agents.status_completed");
    case "active":
      return t("agents.status_active");
    case "waiting":
      return t("agents.status_waiting");
    case "failed":
      return t("agents.status_failed");
    case "paused":
      return t("agents.status_paused");
    case "partial_success":
      return t("reports.status_partial_success");
    case "needs_review":
      return t("reports.status_needs_review");
    case "monitoring":
      return t("reports.status_monitoring");
    default:
      return "Unbekannt";
  }
}

function statusIcon(status: AgentJob["status"]) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={14} className="text-[color:var(--ds-success-text)]" />;
    case "active":
      return <Loader2 size={14} className="animate-spin text-[color:var(--ds-info-text)]" />;
    case "waiting":
      return <Clock size={14} className="text-[color:var(--ds-warning-text)]" />;
    case "failed":
      return <XCircle size={14} className="text-[color:var(--ds-danger-text)]" />;
    case "paused":
      return <Pause size={14} className="text-[color:var(--ds-neutral-text)]" />;
    default:
      return <Clock size={14} className="text-[color:var(--ds-text-muted)]" />;
  }
}

const sectionLabel =
  "text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase";

// ── Ablaufplan (Gesamtauftrag → Teilaufgaben) ─────────────────

function JobPlan({
  jobs,
  selectedJob,
  onSelectJob,
}: {
  jobs: AgentJob[];
  selectedJob: number | null;
  onSelectJob: (id: number) => void;
}) {
  const rootJobs = useMemo(() => jobs.filter((j) => !j.parentId), [jobs]);
  const height = Math.max(160, rootJobs.length * 140 + 40);

  return (
    <div className="w-full overflow-x-auto" role="img" aria-label="Ablaufplan der Aufträge">
      <div className="min-w-[600px] p-4">
        <svg width="100%" height={height} viewBox={`0 0 800 ${height}`}>
          {rootJobs.map((root, rootIdx) => {
            const children = jobs.filter((j) => j.parentId === root.id);
            const rootX = 100;
            const rootY = 80 + rootIdx * 140;

            return children.map((child, childIdx) => {
              const childX = 500;
              const childY = 40 + childIdx * 80 + rootIdx * 20;
              const midX = (rootX + childX) / 2;

              return (
                <g key={`conn-${root.id}-${child.id}`}>
                  <path
                    d={`M ${rootX + 70} ${rootY} C ${midX} ${rootY}, ${midX} ${childY}, ${childX - 70} ${childY}`}
                    fill="none"
                    stroke={statusFill(child.status)}
                    strokeWidth={2}
                    strokeDasharray={child.status === "waiting" ? "4 4" : undefined}
                    opacity={0.6}
                  />
                  <polygon
                    points={`${childX - 70},${childY} ${childX - 78},${childY - 4} ${childX - 78},${childY + 4}`}
                    fill={statusFill(child.status)}
                  />
                </g>
              );
            });
          })}

          {jobs.map((job) => {
            const isRoot = !job.parentId;
            const isSelected = selectedJob === job.id;

            let x: number, y: number;
            if (isRoot) {
              const rootIdx = rootJobs.findIndex((r) => r.id === job.id);
              x = 30;
              y = 50 + rootIdx * 140;
            } else {
              const parent = jobs.find((j) => j.id === job.parentId);
              const parentIdx = rootJobs.findIndex(
                (r) => r.id === parent?.parentId || r.id === parent?.id
              );
              const siblingIdx = jobs
                .filter((j) => j.parentId === job.parentId)
                .findIndex((j) => j.id === job.id);
              x = 430;
              y = 10 + siblingIdx * 80 + (parentIdx ?? 0) * 20;
            }

            return (
              <g
                key={job.id}
                className="cursor-pointer"
                onClick={() => onSelectJob(job.id)}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={x}
                  y={y}
                  width={140}
                  height={60}
                  rx={8}
                  fill={isSelected ? "var(--ds-surface-2)" : "var(--ds-surface)"}
                  stroke={isSelected ? "var(--brand-primary)" : "var(--ds-border-strong)"}
                  strokeWidth={isSelected ? 2 : 1}
                />
                <circle cx={x + 12} cy={y + 12} r={5} fill={statusFill(job.status)} />
                <text x={x + 12} y={y + 34} fill="var(--ds-text)" fontSize={12} fontWeight={600}>
                  {jobLabel(job)}
                </text>
                <text x={x + 12} y={y + 50} fill="var(--ds-text-subtle)" fontSize={10}>
                  Nr. {job.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ── Job Detail Panel ─────────────────────────────────────────

function JobDetail({
  job,
  allJobs,
  onRefresh,
  onSelectJob,
}: {
  job: AgentJob;
  allJobs: AgentJob[];
  onRefresh: () => void;
  onSelectJob: (id: number) => void;
}) {
  const { t } = useLang();
  const { addToast } = useToast();
  const children = allJobs.filter((j: AgentJob) => j.parentId === job.id);
  const [acting, setActing] = useState<string | null>(null);

  const runAction = async (action: string, label: string, fn: () => Promise<unknown>) => {
    setActing(action);
    try {
      await fn();
      onRefresh();
    } catch (err) {
      console.error(`[agents] ${action} failed:`, err instanceof Error ? err.message : err);
      addToast({
        type: "error",
        title: `${label} nicht möglich`,
        description: "Bitte aktualisieren Sie die Ansicht und versuchen Sie es erneut.",
        duration: 5000,
      });
    } finally {
      setActing(null);
    }
  };

  const inboxEnabled =
    job.status === "active" || job.status === "waiting" || job.status === "paused";
  const inboxQuery = useAgentInbox(job.id, inboxEnabled);
  const sendMutation = useSendInboxMessage();
  const pauseMutation = usePauseAgent();
  const resumeMutation = useResumeAgent();
  const cancelMutation = useCancelAgent();
  const replayMutation = useReplayAgent();

  const messages = useMemo(() => inboxQuery.data ?? [], [inboxQuery.data]);
  const [inboxInput, setInboxInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const resultText = readableResult(job.result);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSendMessage() {
    if (!inboxInput.trim()) return;
    try {
      const msg = await sendMutation.mutateAsync({ jobId: job.id, text: inboxInput.trim() });
      if (msg) setInboxInput("");
    } catch (err) {
      console.error("[agents] send failed:", err instanceof Error ? err.message : err);
      addToast({
        type: "error",
        title: "Nachricht nicht gesendet",
        description: "Bitte versuchen Sie es erneut.",
        duration: 5000,
      });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusColor(job.status)}`}
            aria-hidden="true"
          />
          <h2 className="truncate text-base font-semibold text-[color:var(--ds-text)]">
            {jobLabel(job)}
          </h2>
          <span className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
            Nr. {job.id}
          </span>
        </div>
        <span className="rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-0.5 text-xs text-[color:var(--ds-text-muted)]">
          {statusLabel(job.status, t)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {(job.status === "waiting" || job.status === "active") && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              runAction("pause", t("agents.btn_pause"), () => pauseMutation.mutateAsync(job.id))
            }
            disabled={acting !== null}
          >
            {acting === "pause" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Pause size={12} />
            )}
            {t("agents.btn_pause")}
          </Button>
        )}
        {job.status === "paused" && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              runAction("resume", t("agents.btn_resume"), () => resumeMutation.mutateAsync(job.id))
            }
            disabled={acting !== null}
          >
            {acting === "resume" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Play size={12} />
            )}
            {t("agents.btn_resume")}
          </Button>
        )}
        {(job.status === "waiting" || job.status === "active" || job.status === "paused") && (
          <Button
            size="sm"
            variant="ghost"
            className="text-[color:var(--ds-danger-text)]"
            onClick={() =>
              runAction("cancel", t("agents.btn_cancel"), () => cancelMutation.mutateAsync(job.id))
            }
            disabled={acting !== null}
          >
            {acting === "cancel" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <XCircle size={12} />
            )}
            {t("agents.btn_cancel")}
          </Button>
        )}
        {(job.status === "completed" || job.status === "failed") && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              runAction("replay", t("agents.btn_replay"), () => replayMutation.mutateAsync(job.id))
            }
            disabled={acting !== null}
          >
            {acting === "replay" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RotateCcw size={12} />
            )}
            {t("agents.btn_replay")}
          </Button>
        )}
      </div>

      <section>
        <h3 className={cn(sectionLabel, "mb-1.5")}>Aufgabe</h3>
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
          {job.prompt || "—"}
        </p>
      </section>

      {job.progress && job.progress.total > 0 && (
        <section className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-[color:var(--ds-text-muted)]">
              {job.progress.message}
            </span>
            <span className="shrink-0 text-[color:var(--ds-text)] tabular-nums">
              Schritt {job.progress.step} von {job.progress.total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-surface-2)]">
            <div
              className="brand-bg h-full rounded-full transition-[width] duration-[var(--ds-duration-normal)] motion-reduce:transition-none"
              style={{
                width: `${Math.min(100, (job.progress.step / job.progress.total) * 100)}%`,
              }}
            />
          </div>
        </section>
      )}

      {job.result && (
        <section className="space-y-2">
          <h3 className={sectionLabel}>{t("agents.section_result")}</h3>
          {resultText ? (
            <>
              <p className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
                {resultText}
              </p>
              <GroundedOutputPanel text={resultText} />
            </>
          ) : (
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              Das Ergebnis liegt als strukturierte Daten vor und wird in der zugehörigen Akte bzw.
              unter Freigaben angezeigt.
            </p>
          )}
        </section>
      )}

      {children.length > 0 && (
        <section>
          <h3 className={cn(sectionLabel, "mb-2")}>Teilaufgaben</h3>
          <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-lg border border-[color:var(--ds-border)]">
            {children.map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  onClick={() => onSelectJob(child.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${statusColor(child.status)}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-[color:var(--ds-text)]">
                    {jobLabel(child)}
                  </span>
                  <span className="text-xs text-[color:var(--ds-text-muted)]">
                    {statusLabel(child.status, t)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Rückfragen / Steuerung laufender Aufträge */}
      {(inboxEnabled || messages.length > 0) && (
        <section className="flex max-h-[380px] flex-col overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] px-4 py-2.5">
            <h3 className={sectionLabel}>Nachrichten</h3>
            {messages.length > 0 && (
              <span className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                {messages.length}
              </span>
            )}
          </div>

          <div ref={scrollRef} className="min-h-[100px] flex-1 space-y-3 overflow-y-auto p-3">
            {inboxQuery.isLoading && messages.length === 0 && (
              <div className="space-y-2" aria-hidden="true">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="ml-auto h-8 w-2/3" />
              </div>
            )}
            {messages.length === 0 && !inboxQuery.isLoading && (
              <p className="py-4 text-center text-xs text-[color:var(--ds-text-muted)]">
                Noch keine Nachrichten. Hier können Sie dem laufenden Auftrag Hinweise geben.
              </p>
            )}

            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              const text = formatInboxPayload(msg.payload, t);
              return (
                <div
                  key={msg.id}
                  className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      isUser ? "brand-soft" : "bg-[color:var(--ds-surface-2)]"
                    )}
                    aria-hidden="true"
                  >
                    {isUser ? (
                      <User size={12} className="brand-text" />
                    ) : (
                      <Bot size={12} className="text-[color:var(--ds-text-muted)]" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-xl border px-3 py-2 text-sm",
                      isUser
                        ? "brand-soft brand-border text-[color:var(--ds-text)]"
                        : "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]"
                    )}
                  >
                    <p className="leading-relaxed break-words whitespace-pre-wrap">{text}</p>
                    <span className="mt-1 block text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
                      {formatDateTime(msg.sent_at)}
                      {msg.read_at && <span className="ml-1">· {t("agents.label_read")}</span>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {inboxEnabled && (
            <div className="border-t border-[color:var(--ds-border)] p-3">
              <div className="flex gap-2">
                <Input
                  value={inboxInput}
                  onChange={(e) => setInboxInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                  placeholder="Hinweis an den laufenden Auftrag …"
                  aria-label="Hinweis an den laufenden Auftrag"
                  disabled={sendMutation.isPending}
                />
                <Button
                  size="sm"
                  onClick={handleSendMessage}
                  disabled={sendMutation.isPending || !inboxInput.trim()}
                  className="shrink-0"
                >
                  {sendMutation.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Send size={12} />
                  )}
                  {t("agents.btn_send")}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {(job.startedAt || job.completedAt) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
          {job.startedAt && (
            <span>
              {t("agents.label_started")}: {formatDateTime(job.startedAt)}
            </span>
          )}
          {job.completedAt && (
            <span>
              {t("agents.label_completed")}: {formatDateTime(job.completedAt)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Vorlagen für neue Aufträge ────────────────────────────────

const TASK_TEMPLATES: { label: string; prompt: string }[] = [
  {
    label: "Due-Diligence-Prüfung",
    prompt:
      "Due-Diligence-Prüfung durchführen: Risiken, Haftungsklauseln und fehlende Standardklauseln in allen Verträgen und Dokumenten identifizieren und das Gesamtrisiko bewerten.",
  },
  {
    label: "Vertragsprüfung",
    prompt:
      "Alle Verträge nach österreichischem Recht (ABGB, KSchG, DSGVO) prüfen: Klauselmatrix erstellen, kritische Klauseln markieren, konkrete Änderungen vorschlagen und AGB- sowie DSGVO-Konformität beurteilen.",
  },
  {
    label: "Prozessvorbereitung",
    prompt:
      "Prozess vorbereiten: Sachverhalt analysieren, einschlägige Normen und Rechtsprechung identifizieren, Chancen und Risiken bewerten und eine Beweisstrategie entwerfen.",
  },
  {
    label: "Compliance-Prüfung",
    prompt:
      "Compliance-Prüfung durchführen: DSGVO-Konformität, Geldwäscheprävention (§§ 8a ff RAO) und Aufbewahrungspflichten (§§ 131, 132 BAO) prüfen und den Handlungsbedarf priorisiert darstellen.",
  },
  {
    label: "Kanzleiwissen auswerten",
    prompt:
      "Akten und Dokumente der Kanzlei auf wiederkehrende Muster und erfolgreiche Vorgehensweisen durchsehen und die Erkenntnisse zusammenfassen.",
  },
];

// ── Main Page ────────────────────────────────────────────────

export default function AgentsPage() {
  const { t } = useLang();
  const { addToast } = useToast();
  const [tab, setTab] = useState<"jobs" | "builder">("jobs");
  const agentsQuery = useAgents();
  const submitMutation = useSubmitSupervisor();
  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "failed">("all");
  const [submitPrompt, setSubmitPrompt] = useState("");

  const jobs = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);
  const loading = agentsQuery.isLoading;

  const filteredJobs = useMemo(() => {
    if (filter === "all") return jobs;
    return jobs.filter((j: AgentJob) => j.status === filter);
  }, [jobs, filter]);

  const selectedJobData = useMemo(
    () => jobs.find((j: AgentJob) => j.id === selectedJob) ?? null,
    [jobs, selectedJob]
  );

  const activeCount = jobs.filter((j: AgentJob) => j.status === "active").length;
  const hasPlan = jobs.some((j) => j.parentId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!submitPrompt.trim()) return;
    try {
      const jobId = await submitMutation.mutateAsync({ prompt: submitPrompt.trim() });
      if (jobId) {
        setSubmitPrompt("");
        setSelectedJob(jobId);
      }
    } catch (err) {
      console.error("[agents] submit failed:", err instanceof Error ? err.message : err);
      addToast({
        type: "error",
        title: "Auftrag konnte nicht gestartet werden",
        description: "Bitte versuchen Sie es in einigen Minuten erneut.",
        duration: 5000,
      });
    }
  }

  const tabClass = (active: boolean) =>
    cn(
      "flex items-center gap-2 border-b-2 px-1 pb-2.5 text-sm font-medium whitespace-nowrap transition-[color,border-color] duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
      active
        ? "brand-text border-[color:var(--brand-primary)]"
        : "border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
    );

  return (
    <div className="ds-page min-w-0 space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Assistenten-Aufträge"
        description="Mehrstufige Aufgaben an den Assistenten übergeben, den Fortschritt verfolgen und Ergebnisse prüfen."
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: "Einstellungen", href: "/dashboard/settings" },
          { label: "Assistenten-Aufträge" },
        ]}
        actions={
          tab === "jobs" && jobs.length > 0 ? (
            <Button
              variant="secondary"
              onClick={() => agentsQuery.refetch()}
              className="whitespace-nowrap"
            >
              <RefreshCw size={14} aria-hidden="true" />
              {t("agents.btn_refresh")}
            </Button>
          ) : undefined
        }
      />

      <div
        className="flex gap-6 border-b border-[color:var(--ds-border)]"
        role="tablist"
        aria-label="Ansicht"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "jobs"}
          onClick={() => setTab("jobs")}
          className={tabClass(tab === "jobs")}
        >
          <ListTree size={15} aria-hidden="true" />
          Aufträge
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "builder"}
          onClick={() => setTab("builder")}
          className={tabClass(tab === "builder")}
        >
          <Wand2 size={15} aria-hidden="true" />
          Vorlagen
        </button>
      </div>

      {tab === "builder" ? (
        <AgentBuilder
          onRunComplete={(jobId) => {
            setTab("jobs");
            setSelectedJob(jobId);
          }}
        />
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          {/* Links: neuer Auftrag + Liste */}
          <div className="min-w-0 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-2">
              <label htmlFor="agent-task" className={sectionLabel}>
                Neuer Auftrag
              </label>
              <textarea
                id="agent-task"
                value={submitPrompt}
                onChange={(e) => setSubmitPrompt(e.target.value)}
                placeholder={t("agents.task_placeholder")}
                rows={3}
                className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              />
              <div className="flex flex-wrap gap-1.5" aria-label="Vorlagen">
                {TASK_TEMPLATES.map((template) => (
                  <button
                    key={template.label}
                    type="button"
                    onClick={() => setSubmitPrompt(template.prompt)}
                    className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
                  >
                    {template.label}
                  </button>
                ))}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={submitMutation.isPending || !submitPrompt.trim()}
              >
                {submitMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Send size={14} aria-hidden="true" />
                )}
                Auftrag starten
              </Button>
            </form>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className={sectionLabel}>Aufträge</h2>
                {activeCount > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[color:var(--ds-info-solid)]" />
                    {activeCount} {t("agents.active_count")}
                  </span>
                )}
              </div>

              {jobs.length > 0 && (
                <div className="flex gap-1 overflow-x-auto">
                  {(["all", "active", "completed", "failed"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      aria-pressed={filter === f}
                      className={cn(
                        "shrink-0 rounded-md border px-2 py-1 text-xs font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-[var(--ds-duration-fast)] motion-reduce:transition-none",
                        filter === f
                          ? "brand-soft brand-text brand-border"
                          : "border-transparent text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                      )}
                    >
                      {f === "all"
                        ? t("agents.filter_all")
                        : f === "active"
                          ? t("agents.status_active")
                          : f === "completed"
                            ? t("agents.status_completed")
                            : t("agents.status_failed")}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                {loading && jobs.length === 0 && (
                  <div className="space-y-2" role="status" aria-label="Wird geladen">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                )}
                {!loading && agentsQuery.error && (
                  <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-3 text-xs text-[color:var(--ds-danger-text)]">
                    Aufträge konnten nicht geladen werden.
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => agentsQuery.refetch()}
                      className="ml-auto"
                    >
                      <RefreshCw size={12} aria-hidden="true" />
                      {t("agents.btn_refresh")}
                    </Button>
                  </div>
                )}
                {!loading && !agentsQuery.error && jobs.length === 0 && (
                  <p className="rounded-lg border border-dashed border-[color:var(--ds-border-strong)] px-3 py-4 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                    Noch keine Aufträge. Beschreiben Sie oben eine Aufgabe oder wählen Sie eine
                    Vorlage.
                  </p>
                )}
                {!loading && jobs.length > 0 && filteredJobs.length === 0 && (
                  <p className="px-1 py-3 text-xs text-[color:var(--ds-text-muted)]">
                    Keine Aufträge mit diesem Status.
                  </p>
                )}
                {filteredJobs.map((job: AgentJob) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setSelectedJob(job.id)}
                    aria-pressed={selectedJob === job.id}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition-[background-color,border-color] duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
                      selectedJob === job.id
                        ? "brand-soft brand-border"
                        : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:border-[color:var(--ds-border-strong)]"
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      {statusIcon(job.status)}
                      <span className="text-xs font-medium text-[color:var(--ds-text)]">
                        {jobLabel(job)}
                      </span>
                      <span className="ml-auto text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                        Nr. {job.id}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                      {job.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* Rechts: Detail + Ablaufplan */}
          <div className="min-w-0 space-y-6">
            {selectedJobData ? (
              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 md:p-5">
                <JobDetail
                  job={selectedJobData}
                  allJobs={jobs}
                  onRefresh={() => agentsQuery.refetch()}
                  onSelectJob={setSelectedJob}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[color:var(--ds-border-strong)] px-6 py-10">
                <div className="mx-auto max-w-md space-y-4">
                  <p className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {jobs.length === 0 ? "So funktionieren Aufträge" : "Kein Auftrag ausgewählt"}
                  </p>
                  {jobs.length === 0 ? (
                    <ol className="space-y-2">
                      {[
                        "Aufgabe beschreiben oder eine Vorlage wählen.",
                        "Der Assistent teilt die Aufgabe in Teilaufgaben (z. B. Recherche, Fristen-Erkennung) und arbeitet sie ab.",
                        t("agents.seed_step_3") + ".",
                      ].map((text, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-3 text-sm text-[color:var(--ds-text-muted)]"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--ds-surface-2)] text-xs font-semibold text-[color:var(--ds-text)] tabular-nums">
                            {i + 1}
                          </span>
                          {text}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-[color:var(--ds-text-muted)]">
                      Wählen Sie links einen Auftrag, um Aufgabe, Fortschritt und Ergebnis zu sehen.
                    </p>
                  )}
                </div>
              </div>
            )}

            {hasPlan && (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className={sectionLabel}>Ablaufplan</h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                    {(
                      [
                        ["completed", t("agents.legend_completed")],
                        ["active", t("agents.legend_active")],
                        ["waiting", t("agents.legend_waiting")],
                        ["failed", t("agents.legend_failed")],
                      ] as const
                    ).map(([status, label]) => (
                      <span key={status} className="flex items-center gap-1">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: statusFill(status) }}
                          aria-hidden="true"
                        />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
                  <JobPlan jobs={jobs} selectedJob={selectedJob} onSelectJob={setSelectedJob} />
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
