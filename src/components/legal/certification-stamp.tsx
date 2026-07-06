"use client";

import { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Info,
  Cpu,
  Clock,
  Hash,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  FileCheck,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import {
  CERT_STATUS_CONFIG,
  type AICertification,
  type CertificationStatus,
} from "@/lib/ai-certification";

interface CertificationStampProps {
  cert: AICertification;
  /** Compact mode: single-line badges only */
  compact?: boolean;
  /** Show expandable details */
  expandable?: boolean;
  className?: string;
}

export function CertificationStamp({
  cert,
  compact = false,
  expandable = true,
  className,
}: CertificationStampProps) {
  const { lang } = useLang();
  const isEn = lang === "en";
  const [expanded, setExpanded] = useState(false);

  const statusConfig = CERT_STATUS_CONFIG[cert.status] ?? CERT_STATUS_CONFIG.pending;
  const StatusIcon =
    cert.status === "reviewed" || cert.status === "certified"
      ? ShieldCheck
      : cert.status === "rejected"
        ? XCircle
        : ShieldAlert;

  const hasDetails = !!cert.model || !!cert.pipeline || !!cert.specialist || !!cert.contentHash;

  if (compact) {
    return (
      <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
        {/* AI Act badge */}
        <span
          className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700"
          title={cert.aiNotice}
        >
          <Info size={9} />
          {cert.aiBadgeLabel}
        </span>

        {/* Status badge */}
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
            statusConfig.borderColor,
            statusConfig.bgColor,
            statusConfig.color
          )}
        >
          <StatusIcon size={9} />
          {isEn ? statusConfig.labelEn : statusConfig.label}
        </span>

        {/* Confidence score */}
        {cert.confidenceScore !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums",
              cert.confidenceScore >= 70
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                : cert.confidenceScore >= 50
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                  : "border-red-500/30 bg-red-500/10 text-red-600"
            )}
          >
            Score: {cert.confidenceScore}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-[color:var(--ds-surface)] p-3",
        statusConfig.borderColor,
        className
      )}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* AI Act Art. 50 badge */}
        <span
          className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700"
          title={cert.aiNotice}
        >
          <Info size={10} />
          {cert.aiBadgeLabel}
        </span>

        {/* Certification status */}
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            statusConfig.borderColor,
            statusConfig.bgColor,
            statusConfig.color
          )}
        >
          <StatusIcon size={10} />
          {isEn ? statusConfig.labelEn : statusConfig.label}
        </span>

        {/* Confidence score */}
        {cert.confidenceScore !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
              cert.confidenceScore >= 70
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                : cert.confidenceScore >= 50
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                  : "border-red-500/30 bg-red-500/10 text-red-600"
            )}
          >
            <FileCheck size={10} />
            {isEn ? "Confidence" : "Confidence"}: {cert.confidenceScore}/100
          </span>
        )}

        {/* Model badge */}
        {cert.model && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ds-text-muted)]"
            title={`${cert.model.provider} · ${cert.model.dataResidency === "eu" ? "EU-hosted" : "Non-EU"}`}
          >
            <Cpu size={10} />
            {cert.model.name}
            {cert.model.dataResidency === "eu" && <Globe size={9} className="text-emerald-500" />}
          </span>
        )}

        {/* Expand toggle */}
        {expandable && hasDetails && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? (isEn ? "Less" : "Weniger") : isEn ? "Details" : "Details"}
          </button>
        )}
      </div>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <div className="mt-3 space-y-2 border-t border-[color:var(--ds-border)] pt-3">
          {/* Pipeline info */}
          {cert.pipeline && (
            <div className="flex items-start gap-2 text-[11px]">
              <span className="shrink-0 text-[color:var(--ds-text-muted)]">
                {isEn ? "Pipeline:" : "Pipeline:"}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-[color:var(--ds-text)]">
                  {cert.pipeline.caseSlug}
                  {cert.pipeline.layer !== undefined && ` · Layer ${cert.pipeline.layer}`}
                  {cert.pipeline.layerName && ` (${cert.pipeline.layerName})`}
                </span>
                {cert.pipeline.ensembleRecommendation && (
                  <span className="ml-1 text-[color:var(--ds-text-muted)]">
                    · {cert.pipeline.ensembleRecommendation}
                  </span>
                )}
                {cert.pipeline.retryCount !== undefined && cert.pipeline.retryCount > 0 && (
                  <span className="ml-1 text-amber-600">
                    · {cert.pipeline.retryCount} {isEn ? "retries" : "Retries"}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Specialist */}
          {cert.specialist && (
            <div className="flex items-center gap-2 text-[11px]">
              <Cpu size={10} className="shrink-0 text-[color:var(--ds-text-muted)]" />
              <span className="text-[color:var(--ds-text-muted)]">
                {isEn ? "Specialist:" : "Spezialist:"}
              </span>
              <span className="text-[color:var(--ds-text)]">{cert.specialist}</span>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex items-center gap-2 text-[11px]">
            <Clock size={10} className="shrink-0 text-[color:var(--ds-text-muted)]" />
            <span className="text-[color:var(--ds-text-muted)]">
              {isEn ? "Generated:" : "Erstellt:"}
            </span>
            <span className="text-[color:var(--ds-text)]">
              {new Date(cert.generatedAt).toLocaleString(isEn ? "en-GB" : "de-DE")}
            </span>
          </div>

          {cert.reviewedAt && (
            <div className="flex items-center gap-2 text-[11px]">
              <CheckCircle2 size={10} className="shrink-0 text-emerald-600" />
              <span className="text-[color:var(--ds-text-muted)]">
                {isEn ? "Reviewed:" : "Geprüft:"}
              </span>
              <span className="text-[color:var(--ds-text)]">
                {new Date(cert.reviewedAt).toLocaleString(isEn ? "en-GB" : "de-DE")}
                {cert.reviewerName && ` · ${cert.reviewerName}`}
              </span>
            </div>
          )}

          {/* Citations */}
          {(cert.verifiedCitationCount !== undefined ||
            cert.unverifiedCitationCount !== undefined) && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="shrink-0 text-[color:var(--ds-text-muted)]">
                {isEn ? "Citations:" : "Zitate:"}
              </span>
              <span className="text-emerald-600">
                {cert.verifiedCitationCount ?? 0} {isEn ? "verified" : "verifiziert"}
              </span>
              {(cert.unverifiedCitationCount ?? 0) > 0 && (
                <span className="text-amber-600">
                  · {cert.unverifiedCitationCount} {isEn ? "unverified" : "unverifiziert"}
                </span>
              )}
            </div>
          )}

          {/* Content hash */}
          {cert.contentHash && (
            <div className="flex items-center gap-2 text-[11px]">
              <Hash size={10} className="shrink-0 text-[color:var(--ds-text-muted)]" />
              <span className="text-[color:var(--ds-text-muted)]">{isEn ? "Hash:" : "Hash:"}</span>
              <code className="rounded bg-[color:var(--ds-bg)] px-1 py-0.5 font-mono text-[10px] text-[color:var(--ds-text)]">
                {cert.contentHash}
              </code>
            </div>
          )}

          {/* Jurisdiction */}
          {cert.jurisdiction && (
            <div className="flex items-center gap-2 text-[11px]">
              <Globe size={10} className="shrink-0 text-[color:var(--ds-text-muted)]" />
              <span className="text-[color:var(--ds-text-muted)]">
                {isEn ? "Jurisdiction:" : "Jurisdiktion:"}
              </span>
              <span className="font-medium text-[color:var(--ds-text)]">
                {cert.jurisdiction.toUpperCase()}
              </span>
            </div>
          )}

          {/* Review notes */}
          {cert.reviewNotes && (
            <div className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] p-2 text-[11px] text-[color:var(--ds-text)]">
              <span className="font-medium">{isEn ? "Review notes:" : "Prüfungsnotiz:"}</span>
              <p className="mt-0.5">{cert.reviewNotes}</p>
            </div>
          )}

          {/* AI Act full notice */}
          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-[10px] leading-relaxed text-amber-700">
            {cert.aiNotice}
          </div>
        </div>
      )}
    </div>
  );
}
