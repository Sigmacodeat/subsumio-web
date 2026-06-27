"use client";

import { useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle,
  FileText,
  Eye,
  Users,
  Info,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

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
    article: "Art. 11 EU AI Act",
    reqKey: "aiact.req.art11",
    status: "partial",
    evidence: "CLAUDE.md, AUDIT.md, docs/PRODUCT_CAPABILITIES.md",
    noteKey: "aiact.note.art11",
  },
  {
    id: "art13",
    article: "Art. 13 EU AI Act",
    reqKey: "aiact.req.art13",
    status: "compliant",
    evidence: "AIActConformityBanner-Komponente in allen Legal-AI-Outputs",
    noteKey: "aiact.note.art13",
  },
  {
    id: "art14",
    article: "Art. 14 EU AI Act",
    reqKey: "aiact.req.art14",
    status: "compliant",
    evidence: "Human-Review-Gate in Legal-Routes, Citation-Gate, Release-Gate",
    noteKey: "aiact.note.art14",
  },
  {
    id: "art15",
    article: "Art. 15 EU AI Act",
    reqKey: "aiact.req.art15",
    status: "partial",
    evidence: "RAG-Eval, Brain-Quality-Eval, Citation-Gate, Security-Headers",
    noteKey: "aiact.note.art15",
  },
  {
    id: "art52",
    article: "Art. 52 EU AI Act",
    reqKey: "aiact.req.art52",
    status: "compliant",
    evidence: "AI-Notice in allen User-facing KI-Outputs",
    noteKey: "aiact.note.art52",
  },
  {
    id: "art9",
    article: "Art. 9 EU AI Act",
    reqKey: "aiact.req.art9",
    status: "pending",
    noteKey: "aiact.note.art9",
  },
  {
    id: "art17",
    article: "Art. 17 EU AI Act",
    reqKey: "aiact.req.art17",
    status: "partial",
    evidence: "CI/CD, E2E-Tests, RAG-Eval, Release-Gates",
    noteKey: "aiact.note.art17",
  },
  {
    id: "art26",
    article: "Art. 26 EU AI Act",
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
      color: "#22c55e",
      label: t("aiact.status_compliant"),
      bg: "#22c55e15",
      border: "#22c55e30",
    },
    partial: {
      icon: AlertTriangle,
      color: "#f59e0b",
      label: t("aiact.status_partial"),
      bg: "#f59e0b15",
      border: "#f59e0b30",
    },
    pending: {
      icon: AlertTriangle,
      color: "#6366f1",
      label: t("aiact.status_pending"),
      bg: "#6366f115",
      border: "#6366f130",
    },
    not_started: {
      icon: XCircle,
      color: "#ef4444",
      label: t("aiact.status_not_started"),
      bg: "#ef444415",
      border: "#ef444430",
    },
  } as const;
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
  const totalCount = CONFORMITY_ITEMS.length;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 20px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <ShieldCheck size={22} style={{ color: "#6366f1" }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0" }}>{t("aiact.title")}</h1>
        </div>
        <p style={{ fontSize: 13, color: "#8a8aa8", lineHeight: 1.6 }}>{t("aiact.intro")}</p>
        <div
          style={{
            marginTop: 8,
            padding: "8px 12px",
            background: "#f59e0b15",
            border: "1px solid #f59e0b30",
            borderRadius: 6,
            fontSize: 12,
            color: "#fbbf24",
          }}
        >
          <strong>{t("aiact.notice")}</strong>
        </div>
      </div>

      {/* Status Overview */}
      <Section title={t("aiact.section_overview")} icon={<Info size={15} />}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <StatCard value={compliantCount} label={t("aiact.stat_compliant")} color="#22c55e" />
          <StatCard value={partialCount} label={t("aiact.stat_partial")} color="#f59e0b" />
          <StatCard value={pendingCount} label={t("aiact.stat_pending")} color="#6366f1" />
        </div>
        <div style={{ background: "#0d0d1a", borderRadius: 6, height: 8, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              background: `linear-gradient(90deg, #22c55e ${(compliantCount / totalCount) * 100}%, #f59e0b ${(compliantCount / totalCount) * 100}% ${((compliantCount + partialCount) / totalCount) * 100}%, #6366f1 ${((compliantCount + partialCount) / totalCount) * 100}%)`,
            }}
          />
        </div>
      </Section>

      {/* Classification */}
      <Section title={t("aiact.section_classification")} icon={<FileText size={15} />}>
        <p style={{ fontSize: 12, color: "#a0a0c0", lineHeight: 1.6, marginBottom: 12 }}>
          {t("aiact.class_intro")}
        </p>
        <div style={{ display: "grid", gap: 8 }}>
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
        </div>
      </Section>

      {/* Technical Documentation */}
      <Section title={t("aiact.section_tech_doc")} icon={<FileText size={15} />}>
        <div style={{ display: "grid", gap: 6 }}>
          {[
            { label: t("aiact.tech_doc.1"), done: true, where: t("aiact.tech_doc.1.where") },
            { label: t("aiact.tech_doc.2"), done: false, where: t("aiact.tech_doc.2.where") },
            { label: t("aiact.tech_doc.3"), done: true, where: t("aiact.tech_doc.3.where") },
            { label: t("aiact.tech_doc.4"), done: true, where: t("aiact.tech_doc.4.where") },
            { label: t("aiact.tech_doc.5"), done: false, where: t("aiact.tech_doc.5.where") },
            { label: t("aiact.tech_doc.6"), done: false, where: t("aiact.tech_doc.6.where") },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                padding: "6px 0",
                borderBottom: "1px solid #1e1e3a",
              }}
            >
              {item.done ? (
                <CheckCircle size={14} style={{ color: "#22c55e", flexShrink: 0, marginTop: 1 }} />
              ) : (
                <AlertTriangle
                  size={14}
                  style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }}
                />
              )}
              <div>
                <div style={{ fontSize: 12, color: "#e0e0e8" }}>{item.label}</div>
                <div style={{ fontSize: 11, color: "#6a6a8a" }}>{item.where}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Human Oversight */}
      <Section title={t("aiact.section_oversight")} icon={<Eye size={15} />}>
        <p style={{ fontSize: 12, color: "#a0a0c0", lineHeight: 1.6, marginBottom: 12 }}>
          {t("aiact.oversight_intro")}
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {[
            {
              title: "Citation-Gate",
              desc: t("aiact.oversight.citation.desc"),
              status: t("aiact.implemented"),
            },
            {
              title: "Human Review Queue",
              desc: t("aiact.oversight.review.desc"),
              status: t("aiact.implemented"),
            },
            {
              title: "AI-Notice in Outputs",
              desc: t("aiact.oversight.notice.desc"),
              status: t("aiact.implemented"),
            },
            {
              title: "Release-Gate",
              desc: t("aiact.oversight.release.desc"),
              status: t("aiact.implemented"),
            },
            {
              title: "Audit-Trail",
              desc: t("aiact.oversight.audit.desc"),
              status: t("aiact.implemented"),
            },
            {
              title: "Ethical-Wall",
              desc: t("aiact.oversight.ethical.desc"),
              status: t("aiact.implemented"),
            },
          ].map((item) => (
            <div
              key={item.title}
              style={{
                padding: "8px 10px",
                background: "#0d0d1a",
                border: "1px solid #1e1e3a",
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: "#c0c0d8" }}>{item.title}</div>
                <span style={{ fontSize: 11, color: "#22c55e", whiteSpace: "nowrap" }}>
                  {item.status}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#6a6a8a", marginTop: 3, lineHeight: 1.5 }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Transparency */}
      <Section title={t("aiact.section_transparency")} icon={<Users size={15} />}>
        <p style={{ fontSize: 12, color: "#a0a0c0", lineHeight: 1.6, marginBottom: 12 }}>
          {t("aiact.transparency_intro")}
        </p>
        <div
          style={{
            padding: "10px 12px",
            background: "#6366f115",
            border: "1px solid #6366f130",
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "#a0a0f8", marginBottom: 4 }}>
            {t("aiact.banner_example")}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "#8a8aa8",
              padding: "6px 8px",
              background: "#1e1e3a",
              borderRadius: 4,
            }}
          >
            <ShieldCheck size={12} style={{ color: "#6366f1" }} />
            {t("aiact.banner_text")}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#a0a0c0", lineHeight: 1.6 }}>
          {t("aiact.transparency_desc")}
        </div>
      </Section>

      {/* Conformity Status Detail */}
      <Section title={t("aiact.section_detail")} icon={<ShieldCheck size={15} />}>
        <div style={{ display: "grid", gap: 8 }}>
          {CONFORMITY_ITEMS.map((item) => {
            const cfg = STATUS_CONFIG[item.status];
            const Icon = cfg.icon;
            const isOpen = expanded.has(item.id);
            return (
              <div
                key={item.id}
                style={{ border: `1px solid ${cfg.border}`, borderRadius: 6, overflow: "hidden" }}
              >
                <button
                  onClick={() => toggle(item.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 12px",
                    background: cfg.bg,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <Icon size={13} style={{ color: cfg.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <span style={{ fontSize: 11, color: "#6a6a8a", marginRight: 6 }}>
                      {item.article}
                    </span>
                    <span style={{ fontSize: 12, color: "#e0e0e8", fontWeight: 500 }}>
                      {t(item.reqKey as DashboardKey)}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: cfg.color, fontWeight: 600, marginRight: 4 }}>
                    {cfg.label}
                  </span>
                  {isOpen ? (
                    <ChevronDown size={12} style={{ color: "#8a8aa8" }} />
                  ) : (
                    <ChevronRight size={12} style={{ color: "#8a8aa8" }} />
                  )}
                </button>
                {isOpen && (
                  <div
                    style={{
                      padding: "10px 12px",
                      background: "#0d0d1a",
                      borderTop: `1px solid ${cfg.border}`,
                    }}
                  >
                    {item.evidence && (
                      <div style={{ marginBottom: 6 }}>
                        <div
                          style={{
                            fontSize: 10,
                            color: "#6a6a8a",
                            textTransform: "uppercase",
                            letterSpacing: "0.4px",
                            marginBottom: 2,
                          }}
                        >
                          {t("aiact.evidence")}
                        </div>
                        <div style={{ fontSize: 12, color: "#c0c0d8" }}>{item.evidence}</div>
                      </div>
                    )}
                    {item.noteKey && (
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "#6a6a8a",
                            textTransform: "uppercase",
                            letterSpacing: "0.4px",
                            marginBottom: 2,
                          }}
                        >
                          {t("aiact.note_label")}
                        </div>
                        <div style={{ fontSize: 12, color: "#a0a0c0" }}>
                          {t(item.noteKey as DashboardKey)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Certification Roadmap Link */}
      <Section title={t("aiact.section_roadmap")} icon={<ShieldCheck size={15} />}>
        <p style={{ fontSize: 12, color: "#a0a0c0", lineHeight: 1.6, marginBottom: 12 }}>
          {t("aiact.roadmap_intro")}
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {[
            {
              cert: "SOC 2 Type II",
              status: t("aiact.cert.soc2.status"),
              eta: "Q2 2027",
              color: "#6366f1",
            },
            {
              cert: "ISO 27001:2022",
              status: t("aiact.cert.iso27001.status"),
              eta: "Q3 2027",
              color: "#6366f1",
            },
            {
              cert: "ISO 42001:2023 (AI Management)",
              status: t("aiact.cert.iso42001.status"),
              eta: "Q3 2027",
              color: "#6366f1",
            },
            {
              cert: "DSGVO-Konformitätserklärung",
              status: t("aiact.cert.gdpr.status"),
              eta: "Q4 2026",
              color: "#f59e0b",
            },
          ].map((item) => (
            <div
              key={item.cert}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                padding: "8px 10px",
                background: "#0d0d1a",
                border: "1px solid #1e1e3a",
                borderRadius: 6,
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#c0c0d8" }}>{item.cert}</div>
                <div style={{ fontSize: 11, color: "#6a6a8a" }}>{item.status}</div>
              </div>
              <span
                style={{ fontSize: 11, color: item.color, whiteSpace: "nowrap", marginLeft: 12 }}
              >
                ETA: {item.eta}
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <a
            href="/docs/CERTIFICATION_ROADMAP.md"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#6366f1",
              textDecoration: "none",
            }}
          >
            <ExternalLink size={12} /> {t("aiact.roadmap_link")}
          </a>
        </div>
      </Section>

      {/* Footer */}
      <div
        style={{
          marginTop: 24,
          padding: "12px 14px",
          background: "#0d0d1a",
          borderRadius: 6,
          border: "1px solid #1e1e3a",
          fontSize: 11,
          color: "#6a6a8a",
        }}
      >
        {t("aiact.footer")}{" "}
        <a href="mailto:compliance@subsum.io" style={{ color: "#6366f1" }}>
          compliance@subsum.io
        </a>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: "1px solid #1e1e3a",
        }}
      >
        <div style={{ color: "#6366f1" }}>{icon}</div>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "#c0c0d8" }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div
      style={{
        padding: "12px",
        background: "#0d0d1a",
        border: `1px solid ${color}30`,
        borderRadius: 6,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6a6a8a", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ClassificationRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 0",
        borderBottom: "1px solid #1e1e3a",
      }}
    >
      <span style={{ fontSize: 12, color: "#6a6a8a" }}>{label}</span>
      <span style={{ fontSize: 12, color: "#c0c0d8", textAlign: "right", maxWidth: "55%" }}>
        {value}
      </span>
    </div>
  );
}
