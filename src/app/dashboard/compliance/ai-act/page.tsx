"use client";

import { useState } from "react";
import {
  AlertTriangle,
  XCircle,
  CheckCircle,
  Circle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { PageHeader } from "@/components/dashboard/page-header";
import { cn } from "@/lib/utils";

interface ConformityItem {
  id: string;
  article: string;
  reqKey: string;
  status: "compliant" | "partial" | "pending" | "not_started";
  evidence?: string;
  noteKey?: string;
}

const CONFORMITY_ITEMS: ConformityItem[] = [
  {
    id: "art11",
    article: "Art. 11 KI-VO",
    reqKey: "aiact.req.art11",
    status: "partial",
    evidence: "Interne Produkt- und Systembeschreibung (auf Anfrage)",
    noteKey: "aiact.note.art11",
  },
  {
    id: "art13",
    article: "Art. 13 KI-VO",
    reqKey: "aiact.req.art13",
    status: "compliant",
    evidence: "KI-Hinweis an KI-Ausgaben",
    noteKey: "aiact.note.art13",
  },
  {
    id: "art14",
    article: "Art. 14 KI-VO",
    reqKey: "aiact.req.art14",
    status: "compliant",
    evidence:
      "Anwaltliche Freigabe vor Schreibaktionen, Belegprüfung der Zitate, Qualitätsprüfung vor jeder Version",
    noteKey: "aiact.note.art14",
  },
  {
    id: "art15",
    article: "Art. 15 KI-VO",
    reqKey: "aiact.req.art15",
    status: "partial",
    evidence:
      "Laufende Qualitätsmessung der Recherche, Belegprüfung der Zitate, Sicherheitsmaßnahmen der Web-Anwendung",
    noteKey: "aiact.note.art15",
  },
  {
    id: "art52",
    article: "Art. 50 KI-VO",
    reqKey: "aiact.req.art52",
    status: "compliant",
    evidence: "Kennzeichnung „KI-Entwurf — anwaltlich zu prüfen“ an KI-Ausgaben",
    noteKey: "aiact.note.art52",
  },
  {
    id: "art9",
    article: "Art. 9 KI-VO",
    reqKey: "aiact.req.art9",
    status: "pending",
    noteKey: "aiact.note.art9",
  },
  {
    id: "art17",
    article: "Art. 17 KI-VO",
    reqKey: "aiact.req.art17",
    status: "partial",
    evidence: "Automatisierte Tests und Qualitätsprüfung vor jeder Version",
    noteKey: "aiact.note.art17",
  },
  {
    id: "art26",
    article: "Art. 26 KI-VO",
    reqKey: "aiact.req.art26",
    status: "partial",
    noteKey: "aiact.note.art26",
  },
];

type TFunc = (key: DashboardKey) => string;

function getStatusConfig(t: TFunc) {
  return {
    compliant: {
      icon: CheckCircle,
      tone: "text-[color:var(--ds-success-text)]",
      label: t("aiact.status_compliant"),
    },
    partial: {
      icon: AlertTriangle,
      tone: "text-[color:var(--ds-warning-text)]",
      label: t("aiact.status_partial"),
    },
    pending: {
      icon: Circle,
      tone: "text-[color:var(--ds-text-muted)]",
      label: t("aiact.status_pending"),
    },
    not_started: {
      icon: XCircle,
      tone: "text-[color:var(--ds-danger-text)]",
      label: t("aiact.status_not_started"),
    },
  } as const;
}

/** Der Schlüssel aiact.implemented trägt ein Emoji — in der Produktoberfläche ohne. */
function stripEmoji(text: string): string {
  return text.replace(/^[\u2705\u2714\uFE0F\s]+/u, "");
}

export default function AIActConformityPage() {
  const { t } = useLang();
  const STATUS_CONFIG = getStatusConfig(t);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const compliantCount = CONFORMITY_ITEMS.filter((i) => i.status === "compliant").length;
  const partialCount = CONFORMITY_ITEMS.filter((i) => i.status === "partial").length;
  const pendingCount = CONFORMITY_ITEMS.filter(
    (i) => i.status === "pending" || i.status === "not_started"
  ).length;

  const techDoc = [
    { label: t("aiact.tech_doc.1"), done: true, where: t("aiact.tech_doc.1.where") },
    { label: t("aiact.tech_doc.2"), done: false, where: t("aiact.tech_doc.2.where") },
    { label: t("aiact.tech_doc.3"), done: true, where: t("aiact.tech_doc.3.where") },
    { label: t("aiact.tech_doc.4"), done: true, where: t("aiact.tech_doc.4.where") },
    { label: t("aiact.tech_doc.5"), done: false, where: t("aiact.tech_doc.5.where") },
    { label: t("aiact.tech_doc.6"), done: false, where: t("aiact.tech_doc.6.where") },
  ];

  const oversight = [
    { title: "Belegprüfung der Zitate", desc: t("aiact.oversight.citation.desc") },
    { title: "Anwaltliche Prüfung", desc: t("aiact.oversight.review.desc") },
    { title: "Kennzeichnung von KI-Ausgaben", desc: t("aiact.oversight.notice.desc") },
    { title: "Qualitätsprüfung vor jeder Version", desc: t("aiact.oversight.release.desc") },
    { title: "Prüfprotokoll", desc: t("aiact.oversight.audit.desc") },
    { title: "Anbieter-Richtlinien", desc: t("aiact.oversight.ethical.desc") },
  ];

  const certs = [
    { cert: "SOC 2 Type II", status: t("aiact.cert.soc2.status"), eta: "Q2 2027" },
    { cert: "ISO/IEC 27001:2022", status: t("aiact.cert.iso27001.status"), eta: "Q3 2027" },
    {
      cert: "ISO/IEC 42001:2023 (KI-Managementsystem)",
      status: t("aiact.cert.iso42001.status"),
      eta: "Q3 2027",
    },
    { cert: "DSGVO-Konformitätserklärung", status: t("aiact.cert.gdpr.status"), eta: "Q4 2026" },
  ];

  return (
    <div className="mx-auto max-w-[720px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("aiact.title")}
        description={t("aiact.intro")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("compliance.breadcrumb"), href: "/dashboard/compliance" },
          { label: "KI-Verordnung" },
        ]}
      />

      <p
        role="note"
        className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]"
      >
        {t("aiact.notice")}
      </p>

      <Section title={t("aiact.section_overview")}>
        <div className="grid grid-cols-3 gap-3">
          <StatCard value={compliantCount} label={t("aiact.stat_compliant")} tone="success" />
          <StatCard value={partialCount} label={t("aiact.stat_partial")} tone="warning" />
          <StatCard value={pendingCount} label={t("aiact.stat_pending")} tone="neutral" />
        </div>
      </Section>

      <Section title={t("aiact.section_classification")} intro={t("aiact.class_intro")}>
        <dl className="divide-y divide-[color:var(--ds-border)] border-y border-[color:var(--ds-border)]">
          <ClassificationRow
            label={t("aiact.class_category")}
            value={t("aiact.class_category_val")}
          />
          <ClassificationRow label={t("aiact.class_risk")} value={t("aiact.class_risk_val")} />
          <ClassificationRow label={t("aiact.class_scope")} value={t("aiact.class_scope_val")} />
          <ClassificationRow label={t("aiact.class_target")} value={t("aiact.class_target_val")} />
          <ClassificationRow
            label={t("aiact.class_no_autonomy")}
            value={t("aiact.class_no_autonomy_val")}
          />
        </dl>
      </Section>

      <Section title={t("aiact.section_tech_doc")}>
        <ul className="divide-y divide-[color:var(--ds-border)] border-y border-[color:var(--ds-border)]">
          {techDoc.map((item) => (
            <li key={item.label} className="flex items-start gap-2.5 py-2">
              {item.done ? (
                <CheckCircle
                  size={14}
                  className="mt-0.5 shrink-0 text-[color:var(--ds-success-text)]"
                  aria-label="Vorhanden"
                />
              ) : (
                <AlertTriangle
                  size={14}
                  className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
                  aria-label="Offen"
                />
              )}
              <div className="min-w-0">
                <div className="text-sm text-[color:var(--ds-text)]">{item.label}</div>
                <div className="text-xs text-[color:var(--ds-text-subtle)]">{item.where}</div>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("aiact.section_oversight")} intro={t("aiact.oversight_intro")}>
        <ul className="divide-y divide-[color:var(--ds-border)] rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          {oversight.map((item) => (
            <li key={item.title} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium text-[color:var(--ds-text)]">{item.title}</div>
                <span className="text-xs whitespace-nowrap text-[color:var(--ds-success-text)]">
                  {stripEmoji(t("aiact.implemented"))}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                {item.desc}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("aiact.section_transparency")} intro={t("aiact.transparency_intro")}>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="mb-2 text-xs font-medium tracking-wide text-[color:var(--ds-text-muted)] uppercase">
            {t("aiact.banner_example")}
          </div>
          <div className="rounded-lg bg-[color:var(--ds-surface-2)] px-3 py-2 text-xs text-[color:var(--ds-text-muted)]">
            {t("aiact.banner_text")}
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
          {t("aiact.transparency_desc")}
        </p>
      </Section>

      <Section title={t("aiact.section_detail")}>
        <ul className="divide-y divide-[color:var(--ds-border)] rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          {CONFORMITY_ITEMS.map((item) => {
            const cfg = STATUS_CONFIG[item.status];
            const Icon = cfg.icon;
            const isOpen = expanded.has(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
                >
                  <Icon size={14} className={cn("shrink-0", cfg.tone)} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-[color:var(--ds-text)]">
                      {t(item.reqKey as DashboardKey)}
                    </div>
                    <div className="text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
                      {item.article}
                    </div>
                  </div>
                  <span className={cn("text-xs font-medium whitespace-nowrap", cfg.tone)}>
                    {cfg.label}
                  </span>
                  {isOpen ? (
                    <ChevronDown
                      size={14}
                      className="shrink-0 text-[color:var(--ds-text-muted)]"
                      aria-hidden="true"
                    />
                  ) : (
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-[color:var(--ds-text-muted)]"
                      aria-hidden="true"
                    />
                  )}
                </button>
                {isOpen && (
                  <div className="space-y-2 border-t border-[color:var(--ds-border)] px-4 py-3">
                    {item.evidence && (
                      <div>
                        <div className="text-xs tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                          {t("aiact.evidence")}
                        </div>
                        <div className="text-sm text-[color:var(--ds-text)]">{item.evidence}</div>
                      </div>
                    )}
                    {item.noteKey && (
                      <div>
                        <div className="text-xs tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                          {t("aiact.note_label")}
                        </div>
                        <div className="text-sm text-[color:var(--ds-text-muted)]">
                          {t(item.noteKey as DashboardKey)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={t("aiact.section_roadmap")} intro={t("aiact.roadmap_intro")}>
        <ul className="divide-y divide-[color:var(--ds-border)] rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          {certs.map((item) => (
            <li key={item.cert} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-[color:var(--ds-text)]">{item.cert}</div>
                <div className="text-xs text-[color:var(--ds-text-subtle)]">{item.status}</div>
              </div>
              <span className="text-xs whitespace-nowrap text-[color:var(--ds-text-muted)] tabular-nums">
                Ziel: {item.eta}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <p className="border-t border-[color:var(--ds-border)] pt-4 text-xs text-[color:var(--ds-text-subtle)]">
        {t("aiact.footer")}{" "}
        <a href="mailto:compliance@subsum.io" className="brand-text hover:underline">
          compliance@subsum.io
        </a>
      </p>
    </div>
  );
}

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
          {title}
        </h2>
        {intro && (
          <p className="mt-1 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">{intro}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function StatCard({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "success" | "warning" | "neutral";
}) {
  const color =
    value === 0 || tone === "neutral"
      ? "text-[color:var(--ds-text)]"
      : tone === "success"
        ? "text-[color:var(--ds-success-text)]"
        : "text-[color:var(--ds-warning-text)]";
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
      <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", color)}>{value}</div>
    </div>
  );
}

function ClassificationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-xs text-[color:var(--ds-text-subtle)]">{label}</dt>
      <dd className="text-sm text-[color:var(--ds-text)] sm:max-w-[60%] sm:text-right">{value}</dd>
    </div>
  );
}
