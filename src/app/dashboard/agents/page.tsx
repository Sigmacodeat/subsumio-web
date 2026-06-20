"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Bot,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Sparkles,
  RefreshCw,
  RotateCcw,
  Send,
  MessageSquare,
  User,
  Wand2,
  ListTree,
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
import { AgentBuilder } from "@/components/dashboard/agent-builder";

// ── Helpers ──────────────────────────────────────────────────

function formatInboxPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object" || payload === null) return String(payload);

  const p = payload as Record<string, unknown>;

  if (p.type === "child_done") {
    const childId = p.child_id ?? "?";
    const outcome =
      p.outcome === "complete"
        ? "abgeschlossen"
        : p.outcome === "failed"
          ? "fehlgeschlagen"
          : String(p.outcome ?? "unbekannt");
    return `Sub-Agent #${childId} ${outcome}.`;
  }

  if (p.type === "cancelled") return `Job abgebrochen${p.error ? `: ${p.error}` : ""}`;
  if (p.type === "timeout") return `Zeitlimit überschritten${p.error ? `: ${p.error}` : ""}`;

  const readable = Object.entries(p)
    .filter(([k]) => k !== "type")
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");
  return readable || JSON.stringify(payload);
}

// ── Status Helpers ───────────────────────────────────────────

function statusColor(status: AgentJob["status"]): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500";
    case "active":
      return "bg-blue-500 animate-pulse";
    case "waiting":
      return "bg-amber-500";
    case "failed":
      return "bg-red-500";
    case "paused":
      return "bg-gray-500";
  }
}

function statusLabel(status: AgentJob["status"]): string {
  switch (status) {
    case "completed":
      return "Fertig";
    case "active":
      return "Aktiv";
    case "waiting":
      return "Wartend";
    case "failed":
      return "Fehler";
    case "paused":
      return "Pausiert";
  }
}

function statusIcon(status: AgentJob["status"]) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={14} className="text-emerald-600" />;
    case "active":
      return <Loader2 size={14} className="animate-spin text-blue-600" />;
    case "waiting":
      return <Clock size={14} className="text-amber-600" />;
    case "failed":
      return <XCircle size={14} className="text-red-600" />;
    case "paused":
      return <Pause size={14} className="text-gray-400" />;
  }
}

// ── DAG Component ────────────────────────────────────────────

function AgentDAG({
  jobs,
  selectedJob,
  onSelectJob,
}: {
  jobs: AgentJob[];
  selectedJob: number | null;
  onSelectJob: (id: number) => void;
}) {
  const rootJobs = useMemo(() => jobs.filter((j) => !j.parentId), [jobs]);

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[600px] p-6">
        <svg width="100%" height="300" viewBox="0 0 800 300">
          {/* Draw connections */}
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
                  {/* Connection path */}
                  <path
                    d={`M ${rootX + 70} ${rootY} C ${midX} ${rootY}, ${midX} ${childY}, ${childX - 70} ${childY}`}
                    fill="none"
                    stroke={
                      child.status === "completed"
                        ? "#10b981"
                        : child.status === "active"
                          ? "#3b82f6"
                          : child.status === "failed"
                            ? "#ef4444"
                            : "#f59e0b"
                    }
                    strokeWidth={2}
                    strokeDasharray={child.status === "waiting" ? "4 4" : undefined}
                    opacity={0.6}
                  />
                  {/* Arrow head */}
                  <polygon
                    points={`${childX - 70},${childY} ${childX - 78},${childY - 4} ${childX - 78},${childY + 4}`}
                    fill={
                      child.status === "completed"
                        ? "#10b981"
                        : child.status === "active"
                          ? "#3b82f6"
                          : child.status === "failed"
                            ? "#ef4444"
                            : "#f59e0b"
                    }
                  />
                </g>
              );
            });
          })}

          {/* Draw nodes */}
          {jobs.map((job) => {
            const isRoot = !job.parentId;
            const isSelected = selectedJob === job.id;

            // Calculate position
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
                {/* Node background */}
                <rect
                  x={x}
                  y={y}
                  width={140}
                  height={60}
                  rx={8}
                  fill={isSelected ? "#4c1d95" : "var(--ds-border)"}
                  stroke={isSelected ? "#8b5cf6" : "#2e2e5a"}
                  strokeWidth={isSelected ? 2 : 1}
                />
                {/* Status indicator */}
                <circle cx={x + 12} cy={y + 12} r={5} className={statusColor(job.status)} />
                {/* Specialist icon indicator */}
                {job.subagentDef && (
                  <text
                    x={x + 130}
                    y={y + 16}
                    textAnchor="end"
                    fill="var(--ds-text-muted)"
                    fontSize={10}
                    fontFamily="monospace"
                  >
                    {job.subagentDef.replace("legal-", "")}
                  </text>
                )}
                {/* Job name */}
                <text x={x + 12} y={y + 32} fill="var(--ds-text)" fontSize={12} fontWeight={600}>
                  {job.name === "supervisor"
                    ? "Supervisor"
                    : job.subagentDef?.replace("legal-", "").replace(/-/g, " ") || "subagent"}
                </text>
                {/* Job ID */}
                <text
                  x={x + 12}
                  y={y + 50}
                  fill="var(--ds-text-subtle)"
                  fontSize={10}
                  fontFamily="monospace"
                >
                  #{job.id}
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
}: {
  job: AgentJob;
  allJobs: AgentJob[];
  onRefresh: () => void;
}) {
  const children = allJobs.filter((j: AgentJob) => j.parentId === job.id);
  const [acting, setActing] = useState<string | null>(null);

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

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSendMessage() {
    if (!inboxInput.trim()) return;
    const msg = await sendMutation.mutateAsync({ jobId: job.id, text: inboxInput.trim() });
    if (msg) {
      setInboxInput("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${statusColor(job.status)}`} />
          <h3 className="text-lg font-semibold text-[color:var(--ds-text)]">
            {job.name === "supervisor"
              ? "Supervisor"
              : job.subagentDef?.replace("legal-", "").replace(/-/g, " ") || "Agent"}
          </h3>
          <span className="font-mono text-xs text-[color:var(--ds-text-muted)]">#{job.id}</span>
        </div>
        <span className="rounded-full bg-[color:var(--ds-border)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)]">
          {statusLabel(job.status)}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {(job.status === "waiting" || job.status === "active") && (
          <button
            onClick={async () => {
              setActing("pause");
              await pauseMutation.mutateAsync(job.id);
              setActing(null);
              onRefresh();
            }}
            disabled={acting !== null}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-600/15 px-3 py-1.5 text-xs font-medium text-amber-600 transition-all hover:bg-amber-600/25 disabled:opacity-40"
          >
            {acting === "pause" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Pause size={12} />
            )}
            Pausieren
          </button>
        )}
        {job.status === "paused" && (
          <button
            onClick={async () => {
              setActing("resume");
              await resumeMutation.mutateAsync(job.id);
              setActing(null);
              onRefresh();
            }}
            disabled={acting !== null}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-600/15 px-3 py-1.5 text-xs font-medium text-emerald-600 transition-all hover:bg-emerald-600/25 disabled:opacity-40"
          >
            {acting === "resume" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Play size={12} />
            )}
            Fortsetzen
          </button>
        )}
        {(job.status === "waiting" || job.status === "active" || job.status === "paused") && (
          <button
            onClick={async () => {
              setActing("cancel");
              await cancelMutation.mutateAsync(job.id);
              setActing(null);
              onRefresh();
            }}
            disabled={acting !== null}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-600/15 px-3 py-1.5 text-xs font-medium text-red-600 transition-all hover:bg-red-600/25 disabled:opacity-40"
          >
            {acting === "cancel" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <XCircle size={12} />
            )}
            Abbrechen
          </button>
        )}
        {(job.status === "completed" || job.status === "failed") && (
          <button
            onClick={async () => {
              setActing("replay");
              await replayMutation.mutateAsync(job.id);
              setActing(null);
              onRefresh();
            }}
            disabled={acting !== null}
            className="brand-soft brand-text brand-border hover:brand-bg/25 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-40"
          >
            {acting === "replay" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RotateCcw size={12} />
            )}
            Neu starten
          </button>
        )}
      </div>

      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <h4 className="mb-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
          Prompt
        </h4>
        <p className="text-sm leading-relaxed text-[color:var(--ds-text)]">{job.prompt}</p>
      </div>

      {job.model && (
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="brand-text" />
          <span className="text-sm text-[color:var(--ds-text-muted)]">
            Modell: <span className="text-[color:var(--ds-text)]">{job.model}</span>
          </span>
        </div>
      )}

      {job.tokens && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
            <div className="font-mono text-lg font-semibold text-[color:var(--ds-text)]">
              {job.tokens.input.toLocaleString()}
            </div>
            <div className="text-xs text-[color:var(--ds-text-muted)]">Input Tokens</div>
          </div>
          <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
            <div className="font-mono text-lg font-semibold text-[color:var(--ds-text)]">
              {job.tokens.output.toLocaleString()}
            </div>
            <div className="text-xs text-[color:var(--ds-text-muted)]">Output Tokens</div>
          </div>
          <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
            <div className="font-mono text-lg font-semibold text-emerald-600">
              ${job.cost?.toFixed(2) ?? "0.00"}
            </div>
            <div className="text-xs text-[color:var(--ds-text-muted)]">Kosten</div>
          </div>
        </div>
      )}

      {job.progress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[color:var(--ds-text-muted)]">{job.progress.message}</span>
            <span className="font-mono text-[color:var(--ds-text)]">
              {job.progress.step}/{job.progress.total}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[color:var(--ds-border)]">
            <div
              className="brand-soft h-full rounded-full transition-all"
              style={{ width: `${(job.progress.step / job.progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {job.result && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h4 className="mb-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
            Ergebnis
          </h4>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
            {job.result}
          </p>
        </div>
      )}

      {children.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
            Children
          </h4>
          <div className="space-y-2">
            {children.map((child) => (
              <div
                key={child.id}
                className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-2"
              >
                <div className={`h-2 w-2 rounded-full ${statusColor(child.status)}`} />
                <span className="text-sm text-[color:var(--ds-text)]">
                  {child.subagentDef?.replace("legal-", "") || "subagent"}
                </span>
                <span className="font-mono text-xs text-[color:var(--ds-text-muted)]">
                  #{child.id}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inbox / Chat Panel */}
      <div
        className="flex flex-col rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
        style={{ maxHeight: 380 }}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="brand-text" />
            <h4 className="text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
              Inbox
            </h4>
            {messages.length > 0 && (
              <span className="brand-soft brand-text brand-border rounded-full border px-1.5 py-0.5 text-xs">
                {messages.length}
              </span>
            )}
          </div>
          {inboxQuery.isLoading && messages.length === 0 && (
            <Loader2 size={12} className="animate-spin text-[color:var(--ds-text-muted)]" />
          )}
        </div>

        <div ref={scrollRef} className="min-h-[120px] flex-1 space-y-3 overflow-y-auto p-3">
          {messages.length === 0 && !inboxQuery.isLoading && (
            <div className="py-6 text-center">
              <Bot size={24} className="mx-auto mb-2 text-[color:var(--ds-border)]" />
              <p className="text-xs text-[color:var(--ds-text-muted)]">Noch keine Nachrichten.</p>
              <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
                {job.status === "active" || job.status === "waiting"
                  ? "Schreibe dem Agenten eine Steuerungsnachricht."
                  : "Inbox ist nur für aktive Jobs verfügbar."}
              </p>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.sender === "user";
            const isSystem = msg.sender === "minions" || msg.sender === "system";
            const text = formatInboxPayload(msg.payload);
            return (
              <div
                key={msg.id}
                className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    isUser ? "brand-soft" : isSystem ? "bg-amber-500/10" : "bg-emerald-500/10"
                  )}
                >
                  {isUser ? (
                    <User size={12} className="brand-text" />
                  ) : isSystem ? (
                    <Bot size={12} className="text-amber-600" />
                  ) : (
                    <Bot size={12} className="text-emerald-600" />
                  )}
                </div>
                <div
                  className={cn(
                    "max-w-[80%] rounded-xl px-3 py-2 text-sm",
                    isUser
                      ? "brand-soft brand-border border text-[color:var(--ds-text)]"
                      : "border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]"
                  )}
                >
                  <p className="leading-relaxed break-words whitespace-pre-wrap">{text}</p>
                  <span className="mt-1 block text-xs text-[color:var(--ds-text-subtle)]">
                    {new Date(msg.sent_at).toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {msg.read_at && <span className="ml-1">· gelesen</span>}
                  </span>
                </div>
              </div>
            );
          })}

          {sendMutation.isPending && (
            <div className="flex flex-row-reverse gap-2.5">
              <div className="brand-soft flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                <Loader2 size={12} className="brand-text animate-spin" />
              </div>
              <div className="brand-soft brand-border rounded-xl border px-3 py-2 text-sm text-[color:var(--ds-text)]">
                <span className="text-[color:var(--ds-text-muted)]">Senden…</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        {(job.status === "active" || job.status === "waiting" || job.status === "paused") && (
          <div className="border-t border-[color:var(--ds-border)] p-3">
            <div className="flex gap-2">
              <input
                value={inboxInput}
                onChange={(e) => setInboxInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                placeholder="Nachricht an Agenten…"
                aria-label="Nachricht an Agenten"
                disabled={sendMutation.isPending}
                className="flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] transition-colors placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={handleSendMessage}
                disabled={sendMutation.isPending || !inboxInput.trim()}
                className="brand-bg brand-bg disabled:hover:brand-bg flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white transition-all disabled:opacity-40"
              >
                {sendMutation.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Send size={12} />
                )}
                Senden
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-[color:var(--ds-text-muted)]">
        {job.startedAt && <span>Gestartet: {new Date(job.startedAt).toLocaleString("de-DE")}</span>}
        {job.completedAt && (
          <span>Fertig: {new Date(job.completedAt).toLocaleString("de-DE")}</span>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function AgentsPage() {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!submitPrompt.trim()) return;
    const jobId = await submitMutation.mutateAsync({ prompt: submitPrompt.trim() });
    if (jobId) {
      setSubmitPrompt("");
      setSelectedJob(jobId);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Tab Bar */}
      <div className="flex items-center gap-1 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-2">
        <button
          onClick={() => setTab("jobs")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
            tab === "jobs"
              ? "brand-soft brand-text brand-border border"
              : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
          )}
        >
          <ListTree size={15} />
          Jobs
        </button>
        <button
          onClick={() => setTab("builder")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
            tab === "builder"
              ? "brand-soft brand-text brand-border border"
              : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
          )}
        >
          <Wand2 size={15} />
          Builder
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
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Job List + Submit */}
          <div className="flex w-80 flex-col border-r border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            {/* Workflow Templates */}
            <div className="space-y-2 border-b border-[color:var(--ds-border)] p-4">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="brand-text" />
                <span className="text-xs font-semibold text-[color:var(--ds-text)]">
                  Workflow Templates
                </span>
              </div>
              <div className="space-y-1.5">
                {[
                  {
                    label: "Due Diligence",
                    prompt:
                      "Führe eine Due Diligence Prüfung durch. Identifiziere Risiken, Haftungsklauseln, fehlende Standardklauseln und bewerte den Gesamtrisiko-Score. Nutze alle verfügbaren Verträge und Dokumente.",
                    icon: "🔍",
                  },
                  {
                    label: "Vertrags-Review",
                    prompt:
                      "Analysiere alle Verträge im Vault nach deutschem Recht. Erstelle eine Klauselmatrix, identifiziere rote Flaggen, und empfehle konkrete Änderungen. Prüfe AGB-Konformität und DSGVO-Klauseln.",
                    icon: "📋",
                  },
                  {
                    label: "Litigation Prep",
                    prompt:
                      "Bereite die Litigation vor. Analysiere den Sachverhalt, identifiziere relevante Gesetze und Präzedenzfälle, erstelle eine Chancen-Risiko-Bewertung, und entwirf eine Beweisstrategie.",
                    icon: "⚖️",
                  },
                  {
                    label: "Compliance-Check",
                    prompt:
                      "Führe einen vollständigen Compliance-Check durch. Prüfe DSGVO-Konformität, GwG-Vorgaben, GOBD-Anforderungen, und identifiziere Handlungsbedarf mit Priorisierung.",
                    icon: "✅",
                  },
                  {
                    label: "Kanzlei-Wissen extrahieren",
                    prompt:
                      "Durchsuche alle Akten und Dokumente der Kanzlei nach wiederkehrenden Mustern, erfolgreichen Strategien, und extrahiere Lessons Learned als Wissensbasis.",
                    icon: "🧠",
                  },
                ].map((template) => (
                  <button
                    key={template.label}
                    onClick={() => {
                      setSubmitPrompt(template.prompt);
                    }}
                    className="hover:brand-border w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-left text-xs text-[color:var(--ds-text-muted)] transition-all hover:text-[color:var(--ds-text)]"
                  >
                    <span className="mr-1.5">{template.icon}</span>
                    {template.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Form */}
            <div className="border-b border-[color:var(--ds-border)] p-4">
              <form onSubmit={handleSubmit} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="brand-text" />
                  <span className="text-xs font-semibold text-[color:var(--ds-text)]">
                    Neuer Supervisor
                  </span>
                </div>
                <input
                  value={submitPrompt}
                  onChange={(e) => setSubmitPrompt(e.target.value)}
                  placeholder="Beschreibe die Aufgabe..."
                  aria-label="Beschreibe die Aufgabe..."
                  className="focus:brand-border/40 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-xs text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={submitMutation.isPending || !submitPrompt.trim()}
                  className="brand-soft brand-text brand-border hover:brand-bg/30 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-40"
                >
                  {submitMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  {submitMutation.isPending ? "Starte..." : "Starten"}
                </button>
              </form>
            </div>

            {/* Header */}
            <div className="border-b border-[color:var(--ds-border)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Agent Jobs</h2>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  <span className="text-xs text-[color:var(--ds-text-muted)]">
                    {activeCount} aktiv
                  </span>
                </div>
              </div>

              <div className="flex gap-1">
                {(["all", "active", "completed", "failed"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium transition-all",
                      filter === f
                        ? "brand-soft brand-text brand-border border"
                        : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text-muted)]"
                    )}
                  >
                    {f === "all"
                      ? "Alle"
                      : f === "active"
                        ? "Aktiv"
                        : f === "completed"
                          ? "Fertig"
                          : "Fehler"}
                  </button>
                ))}
              </div>
            </div>

            {/* Job list */}
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {loading && jobs.length === 0 && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="brand-text animate-spin" />
                </div>
              )}
              {filteredJobs.map((job: AgentJob) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJob(job.id)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-all",
                    selectedJob === job.id
                      ? "brand-soft brand-border"
                      : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:border-[color:var(--ds-border-strong)]"
                  )}
                >
                  <div className="mb-1 flex items-center gap-2">
                    {statusIcon(job.status)}
                    <span className="text-xs font-medium text-[color:var(--ds-text)]">
                      {job.name === "supervisor"
                        ? "Supervisor"
                        : job.subagentDef?.replace("legal-", "") || "subagent"}
                    </span>
                    <span className="ml-auto font-mono text-xs text-[color:var(--ds-text-muted)]">
                      #{job.id}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                    {job.prompt}
                  </p>
                  {job.progress && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-[color:var(--ds-border)]">
                      <div
                        className="brand-soft h-full rounded-full"
                        style={{ width: `${(job.progress.step / job.progress.total) * 100}%` }}
                      />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Middle: DAG Visualization */}
          <div className="flex flex-1 flex-col overflow-hidden bg-[color:var(--ds-bg)]">
            <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] p-4">
              <div className="flex items-center gap-2">
                <Bot size={16} className="brand-text" />
                <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Agent DAG</h2>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => agentsQuery.refetch()}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-all hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                >
                  <RefreshCw size={12} />
                  Aktualisieren
                </button>
                <div className="flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Fertig
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-blue-500" /> Aktiv
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Wartend
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-500" /> Fehler
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <AgentDAG jobs={jobs} selectedJob={selectedJob} onSelectJob={setSelectedJob} />
            </div>
          </div>

          {/* Right: Detail Panel */}
          <div className="w-96 overflow-y-auto border-l border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            <div className="border-b border-[color:var(--ds-border)] p-4">
              <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Details</h2>
            </div>
            <div className="p-4">
              {selectedJobData ? (
                <JobDetail
                  job={selectedJobData}
                  allJobs={jobs}
                  onRefresh={() => agentsQuery.refetch()}
                />
              ) : (
                <div className="py-12 text-center">
                  <Bot size={32} className="mx-auto mb-3 text-[color:var(--ds-border)]" />
                  <p className="text-sm text-[color:var(--ds-text-muted)]">
                    Wähle einen Job aus der Liste
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
