"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  Brain,
  Users,
  CalendarClock,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  ShieldAlert,
  Loader2,
  ChevronDown,
  ChevronRight,
  Scale,
  Building2,
  Mail,
  Phone,
  RefreshCw,
  TrendingUp,
  Database,
  Eye,
  Landmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { csrfFetch } from "@/lib/csrf";
import { statusLabel, type ExtractionStatus } from "@/lib/extraction-status";
import { useApiQuery } from "@/lib/use-api-query";
import type {
  MatterContextBundle,
  MatterParty,
  MatterDeadlineSummary,
  MatterDocumentSummary,
  MatterActivityEntry,
  MatterFactEntry,
  MatterCoverageStatus,
  MatterGap,
  SourceCoverageEntry,
} from "@/lib/matter-context-types";

interface MatterContextPanelProps {
  caseSlug: string;
  className?: string;
  defaultOpen?: boolean;
}

export function MatterContextPanel({
  caseSlug,
  className,
  defaultOpen = true,
}: MatterContextPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { panelTransition } = useDashboardMotion();

  const { data: bundle, loading, error, refetch: loadContext } = useApiQuery<MatterContextBundle>(
    async () => {
      const res = await csrfFetch(`/api/matter-context/${encodeURIComponent(caseSlug)}`, {
        method: "GET",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as MatterContextBundle;
    },
    [caseSlug],
    { enabled: open }
  );

  const criticalGaps = bundle?.gaps.filter((g) => g.severity === "critical") ?? [];
  const _highGaps = bundle?.gaps.filter((g) => g.severity === "high") ?? [];
  const overdueDeadlines = bundle?.deadlines.filter((d) => d.urgency === "overdue") ?? [];

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]",
        className
      )}
    >
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--ds-hover)]"
      >
        <div className="flex items-center gap-2.5">
          {open ? (
            <ChevronDown size={16} className="text-[color:var(--ds-text-muted)]" />
          ) : (
            <ChevronRight size={16} className="text-[color:var(--ds-text-muted)]" />
          )}
          <Brain size={16} className="brand-text" />
          <span className="text-sm font-semibold text-[color:var(--ds-text)]">
            Akte verstanden?
          </span>
          {bundle && (
            <div className="flex items-center gap-1.5">
              {criticalGaps.length > 0 && (
                <Badge className="border border-red-500/20 bg-red-500/10 text-xs text-red-600">
                  {criticalGaps.length} kritisch
                </Badge>
              )}
              {overdueDeadlines.length > 0 && (
                <Badge className="border border-red-500/20 bg-red-500/10 text-xs text-red-600">
                  {overdueDeadlines.length} überfällig
                </Badge>
              )}
              {criticalGaps.length === 0 && overdueDeadlines.length === 0 && (
                <Badge className="border border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-600">
                  OK
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {bundle && (
            <span className="text-xs text-[color:var(--ds-text-subtle)]">
              {Math.round(bundle.coverage.completeness_score * 100)}% Coverage
            </span>
          )}
          {loading && (
            <Loader2 size={14} className="animate-spin text-[color:var(--ds-text-muted)]" />
          )}
        </div>
      </button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="overflow-hidden border-t border-[color:var(--ds-border)]"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={panelTransition}
          >
            {loading && !bundle && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-[color:var(--ds-text-muted)]">
                <Loader2 size={16} className="animate-spin" />
                Lade Matter Context…
              </div>
            )}

            {error && !loading && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <AlertTriangle size={24} className="text-amber-500" />
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  Matter Context konnte nicht geladen werden: {error}
                </p>
                <Button variant="outline" size="sm" onClick={loadContext}>
                  <RefreshCw size={12} className="mr-1.5" />
                  Erneut versuchen
                </Button>
              </div>
            )}

            {bundle && (
              <div className="space-y-4 p-4">
                {/* Summary Bar */}
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[color:var(--ds-surface-2)] p-3">
                  <SummaryItem
                    icon={Users}
                    label="Parteien"
                    value={bundle.parties.length}
                    color="text-blue-600"
                  />
                  <SummaryItem
                    icon={CalendarClock}
                    label="Fristen"
                    value={bundle.deadlines.length}
                    color="text-amber-600"
                  />
                  <SummaryItem
                    icon={FileText}
                    label="Dokumente"
                    value={bundle.documents.length}
                    color="text-gray-600"
                  />
                  <SummaryItem
                    icon={Activity}
                    label="Aktivitäten"
                    value={bundle.recent_activity.length}
                    color="text-purple-600"
                  />
                  <SummaryItem
                    icon={AlertTriangle}
                    label="Lücken"
                    value={bundle.gaps.length}
                    color={bundle.gaps.length > 0 ? "text-red-600" : "text-emerald-600"}
                  />
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadContext}
                      className="h-7 px-2 text-xs"
                    >
                      <RefreshCw size={11} className="mr-1" />
                      Aktualisieren
                    </Button>
                  </div>
                </div>

                {/* Parties */}
                {bundle.parties.length > 0 && (
                  <Section title="Beteiligte" icon={Users}>
                    <div className="space-y-2">
                      {bundle.parties.map((party) => (
                        <PartyRow key={`${party.role}-${party.slug}`} party={party} />
                      ))}
                    </div>
                  </Section>
                )}

                {/* Deadlines */}
                {bundle.deadlines.length > 0 && (
                  <Section title="Fristen" icon={CalendarClock}>
                    <div className="space-y-2">
                      {bundle.deadlines.slice(0, 10).map((deadline, i) => (
                        <DeadlineRow key={deadline.id ?? `dl-${i}`} deadline={deadline} />
                      ))}
                    </div>
                  </Section>
                )}

                {/* Documents */}
                {bundle.documents.length > 0 && (
                  <Section title="Dokumente" icon={FileText}>
                    <div className="space-y-2">
                      {bundle.documents.slice(0, 10).map((doc, i) => (
                        <DocumentRow key={doc.slug ?? `doc-${i}`} doc={doc} />
                      ))}
                      {bundle.documents.length > 10 && (
                        <p className="text-xs text-[color:var(--ds-text-subtle)]">
                          +{bundle.documents.length - 10} weitere Dokumente
                        </p>
                      )}
                    </div>
                  </Section>
                )}

                {/* Coverage */}
                <Section title="Quellenabdeckung" icon={Database}>
                  <CoverageDisplay coverage={bundle.coverage} />
                </Section>

                {/* Gaps */}
                {bundle.gaps.length > 0 && (
                  <Section title="Lücken & Risiken" icon={AlertTriangle}>
                    <div className="space-y-2">
                      {bundle.gaps.map((gap, i) => (
                        <GapRow key={`gap-${i}`} gap={gap} />
                      ))}
                    </div>
                  </Section>
                )}

                {/* Recent Activity */}
                {bundle.recent_activity.length > 0 && (
                  <Section title="Letzte Aktivitäten" icon={Activity}>
                    <div className="space-y-1.5">
                      {bundle.recent_activity.slice(0, 8).map((activity, i) => (
                        <ActivityRow key={`act-${i}`} activity={activity} />
                      ))}
                    </div>
                  </Section>
                )}

                {/* Facts */}
                {bundle.facts.length > 0 && (
                  <Section title="Fakten" icon={Scale}>
                    <div className="space-y-2">
                      {bundle.facts.map((fact) => (
                        <FactRow key={fact.id} fact={fact} />
                      ))}
                    </div>
                  </Section>
                )}

                {/* Engine Status */}
                {!bundle.engine_reachable && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                    <AlertTriangle size={14} className="text-amber-600" />
                    <span className="text-xs text-amber-600">
                      Engine nicht erreichbar — Context kann unvollständig sein
                    </span>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-Components ────────────────────────────────────────────────────

function SummaryItem({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={13} className={color} />
      <span className="text-xs text-[color:var(--ds-text-muted)]">{label}:</span>
      <span className={cn("text-xs font-semibold", color)}>{value}</span>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[color:var(--ds-text)]"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Icon size={13} className="text-[color:var(--ds-text-muted)]" />
        {title}
      </button>
      {expanded && children}
    </div>
  );
}

function PartyRow({ party }: { party: MatterParty }) {
  const roleLabels: Record<MatterParty["role"], string> = {
    client: "Mandant",
    opponent: "Gegenseite",
    lawyer: "Anwalt",
    court: "Gericht",
    witness: "Zeuge",
    third_party: "Dritter",
    other: "Sonstige",
  };
  const roleColors: Record<MatterParty["role"], string> = {
    client: "text-blue-600",
    opponent: "text-red-600",
    lawyer: "text-emerald-600",
    court: "text-purple-600",
    witness: "text-amber-600",
    third_party: "text-gray-600",
    other: "text-gray-500",
  };
  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-medium", roleColors[party.role])}>
            {roleLabels[party.role]}
          </span>
          <span className="truncate text-sm text-[color:var(--ds-text)]">{party.name}</span>
        </div>
        {party.contact_info && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[color:var(--ds-text-subtle)]">
            {party.contact_info.email && (
              <span className="flex items-center gap-0.5">
                <Mail size={9} /> {party.contact_info.email}
              </span>
            )}
            {party.contact_info.phone && (
              <span className="flex items-center gap-0.5">
                <Phone size={9} /> {party.contact_info.phone}
              </span>
            )}
            {party.contact_info.company && (
              <span className="flex items-center gap-0.5">
                <Building2 size={9} /> {party.contact_info.company}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DeadlineRow({ deadline }: { deadline: MatterDeadlineSummary }) {
  const urgencyConfig: Record<
    MatterDeadlineSummary["urgency"],
    { color: string; bg: string; border: string; label: string }
  > = {
    overdue: {
      color: "text-red-600",
      bg: "bg-red-500/5",
      border: "border-red-500/20",
      label: "ÜBERFÄLLIG",
    },
    critical: {
      color: "text-orange-600",
      bg: "bg-orange-500/5",
      border: "border-orange-500/20",
      label: "≤3 Tage",
    },
    upcoming: {
      color: "text-amber-600",
      bg: "bg-amber-500/5",
      border: "border-amber-500/20",
      label: "≤14 Tage",
    },
    normal: {
      color: "text-[color:var(--ds-text-muted)]",
      bg: "",
      border: "border-[color:var(--ds-border)]",
      label: "",
    },
    done: {
      color: "text-emerald-600",
      bg: "bg-emerald-500/5",
      border: "border-emerald-500/20",
      label: "Erledigt",
    },
  };
  const cfg = urgencyConfig[deadline.urgency];
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2",
        cfg.bg,
        cfg.border
      )}
    >
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm text-[color:var(--ds-text)]">{deadline.title}</span>
        {deadline.court && (
          <span className="ml-2 text-xs text-[color:var(--ds-text-subtle)]">
            @ {deadline.court}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-[color:var(--ds-text-muted)]">{deadline.date}</span>
        {cfg.label && (
          <Badge className={cn("border text-xs", cfg.bg, cfg.color, cfg.border)}>{cfg.label}</Badge>
        )}
      </div>
    </div>
  );
}

function DocumentRow({ doc }: { doc: MatterDocumentSummary }) {
  const extractionIcons: Record<ExtractionStatus, React.ReactNode> = {
    uploaded: <Clock size={11} className="text-blue-500" />,
    processing: <Loader2 size={11} className="animate-spin text-blue-500" />,
    text_layer: <CheckCircle2 size={11} className="text-emerald-500" />,
    ocr_needed: <AlertTriangle size={11} className="text-amber-500" />,
    ocr_processing: <Loader2 size={11} className="animate-spin text-amber-500" />,
    ocr_complete: <CheckCircle2 size={11} className="text-emerald-500" />,
    ocr_failed: <XCircle size={11} className="text-red-500" />,
    ready: <CheckCircle2 size={11} className="text-emerald-500" />,
    error: <XCircle size={11} className="text-red-500" />,
  };
  const ocrIcons: Record<string, React.ReactNode> = {
    text_layer: <CheckCircle2 size={11} className="text-emerald-500" />,
    ocr_complete: <CheckCircle2 size={11} className="text-emerald-500" />,
    ocr_needed: <AlertTriangle size={11} className="text-amber-500" />,
    unknown: <Clock size={11} className="text-amber-500" />,
    not_applicable: null,
  };
  const statusIcon = doc.extraction_status
    ? extractionIcons[doc.extraction_status]
    : ocrIcons[doc.ocr_status ?? "not_applicable"];
  const statusText = doc.extraction_status
    ? statusLabel(doc.extraction_status)
    : (doc.ocr_status ?? "");
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <FileText size={13} className="shrink-0 text-[color:var(--ds-text-muted)]" />
        <span className="truncate text-sm text-[color:var(--ds-text)]">{doc.name}</span>
        {doc.extraction_unverified && (
          <Badge className="border border-amber-500/20 bg-amber-500/5 text-xs text-amber-700">
            unverified
          </Badge>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {statusIcon && (
          <span title={statusText} className="flex items-center">
            {statusIcon}
          </span>
        )}
        <span className="text-xs text-[color:var(--ds-text-subtle)]">
          {doc.uploaded_at.slice(0, 10)}
        </span>
      </div>
    </div>
  );
}

function CoverageDisplay({ coverage }: { coverage: MatterCoverageStatus }) {
  const score = Math.round(coverage.completeness_score * 100);
  const scoreColor =
    score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-600";
  return (
    <div className="space-y-3">
      {/* Score Bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-[color:var(--ds-text-muted)]">Completeness Score</span>
            <span className={cn("text-xs font-semibold", scoreColor)}>{score}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[color:var(--ds-surface-2)]">
            <div
              className={cn(
                "h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500"
              )}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-0.5 text-emerald-600">
            <CheckCircle2 size={11} /> {coverage.fresh_sources}
          </span>
          <span className="flex items-center gap-0.5 text-amber-600">
            <Clock size={11} /> {coverage.stale_sources}
          </span>
          {coverage.error_sources > 0 && (
            <span className="flex items-center gap-0.5 text-red-600">
              <XCircle size={11} /> {coverage.error_sources}
            </span>
          )}
        </div>
      </div>

      {/* Source List */}
      <div className="space-y-1">
        {coverage.sources.map((source) => (
          <SourceRow key={source.source_id} source={source} />
        ))}
      </div>

      {/* Warnings */}
      {coverage.warnings.length > 0 && (
        <div className="space-y-1">
          {coverage.warnings.map((warning, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5"
            >
              <AlertTriangle size={11} className="shrink-0 text-amber-600" />
              <span className="text-xs text-amber-600">{warning}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceRow({ source }: { source: SourceCoverageEntry }) {
  const typeIcons: Record<string, React.ElementType> = {
    statute_corpus: Scale,
    judgement_api: Landmark,
    dms: Database,
    email: Mail,
    whatsapp: Phone,
    portal: Users,
    upload: FileText,
    regulatory_feed: TrendingUp,
    commercial: Building2,
  };
  const Icon = typeIcons[source.source_type] ?? Database;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <Icon size={12} className="text-[color:var(--ds-text-muted)]" />
        <span className="text-xs text-[color:var(--ds-text)]">{source.source_label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {source.connected ? (
          <CheckCircle2 size={11} className="text-emerald-500" />
        ) : (
          <XCircle size={11} className="text-[color:var(--ds-text-subtle)]" />
        )}
        {source.index_fresh && source.connected && (
          <span className="text-xs text-emerald-600">frisch</span>
        )}
        {!source.index_fresh && source.connected && (
          <span className="text-xs text-amber-600">stale</span>
        )}
        {source.document_count > 0 && (
          <span className="text-xs text-[color:var(--ds-text-subtle)]">
            {source.document_count} docs
          </span>
        )}
      </div>
    </div>
  );
}

function GapRow({ gap }: { gap: MatterGap }) {
  const severityConfig: Record<
    MatterGap["severity"],
    { color: string; bg: string; border: string; icon: React.ElementType }
  > = {
    critical: {
      color: "text-red-600",
      bg: "bg-red-500/5",
      border: "border-red-500/20",
      icon: ShieldAlert,
    },
    high: {
      color: "text-orange-600",
      bg: "bg-orange-500/5",
      border: "border-orange-500/20",
      icon: AlertTriangle,
    },
    medium: {
      color: "text-amber-600",
      bg: "bg-amber-500/5",
      border: "border-amber-500/20",
      icon: AlertTriangle,
    },
    low: { color: "text-blue-600", bg: "bg-blue-500/5", border: "border-blue-500/20", icon: Eye },
    info: {
      color: "text-[color:var(--ds-text-muted)]",
      bg: "",
      border: "border-[color:var(--ds-border)]",
      icon: Eye,
    },
  };
  const cfg = severityConfig[gap.severity];
  const Icon = cfg.icon;
  return (
    <div className={cn("rounded-lg border px-3 py-2", cfg.bg, cfg.border)}>
      <div className="flex items-start gap-2">
        <Icon size={14} className={cn("mt-0.5 shrink-0", cfg.color)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-semibold uppercase", cfg.color)}>{gap.severity}</span>
            <span className="text-sm font-medium text-[color:var(--ds-text)]">{gap.title}</span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
            {gap.description}
          </p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">→ {gap.recommendation}</p>
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ activity }: { activity: MatterActivityEntry }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--brand-primary)]" />
      <span className="text-[color:var(--ds-text-muted)]">{activity.at.slice(0, 10)}</span>
      <span className="text-[color:var(--ds-text)]">{activity.description}</span>
      {activity.actor && (
        <span className="text-[color:var(--ds-text-subtle)]">— {activity.actor}</span>
      )}
    </div>
  );
}

function FactRow({ fact }: { fact: MatterFactEntry }) {
  const confidenceColors: Record<MatterFactEntry["confidence"], string> = {
    high: "text-emerald-600",
    medium: "text-amber-600",
    low: "text-red-600",
  };
  return (
    <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[color:var(--ds-text)]">{fact.statement}</p>
        <span
          className={cn(
            "shrink-0 text-xs font-semibold uppercase",
            confidenceColors[fact.confidence]
          )}
        >
          {fact.confidence}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-[color:var(--ds-text-subtle)]">
        <span>Quelle: {fact.source}</span>
        {fact.date && <span>· {fact.date.slice(0, 10)}</span>}
      </div>
    </div>
  );
}
