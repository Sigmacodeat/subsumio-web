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

interface ConformityItem {
  id: string;
  article: string;
  requirement: string;
  status: "compliant" | "partial" | "pending" | "not_started";
  evidence?: string;
  note?: string;
}

const CONFORMITY_ITEMS: ConformityItem[] = [
  {
    id: "art11",
    article: "Art. 11 EU AI Act",
    requirement: "Technische Dokumentation",
    status: "partial",
    evidence: "CLAUDE.md, AUDIT.md, docs/PRODUCT_CAPABILITIES.md",
    note: "Vollständige Annex IV-konforme Dokumentation in Erstellung",
  },
  {
    id: "art13",
    article: "Art. 13 EU AI Act",
    requirement: "Transparenz und Informationspflicht gegenüber Nutzern",
    status: "compliant",
    evidence: "AIActConformityBanner-Komponente in allen Legal-AI-Outputs",
    note: "Jede KI-Ausgabe ist als solche gekennzeichnet",
  },
  {
    id: "art14",
    article: "Art. 14 EU AI Act",
    requirement: "Menschliche Aufsicht (Human Oversight)",
    status: "compliant",
    evidence: "Human-Review-Gate in Legal-Routes, Citation-Gate, Release-Gate",
    note: "Alle kritischen KI-Outputs erfordern menschliche Bestätigung",
  },
  {
    id: "art15",
    article: "Art. 15 EU AI Act",
    requirement: "Genauigkeit, Robustheit und Cybersicherheit",
    status: "partial",
    evidence: "RAG-Eval, Brain-Quality-Eval, Citation-Gate, Security-Headers",
    note: "Formales Accuracy-Benchmarking gegen Branchenstandard ausstehend",
  },
  {
    id: "art52",
    article: "Art. 52 EU AI Act",
    requirement: "Transparenzpflichten für bestimmte KI-Systeme",
    status: "compliant",
    evidence: "AI-Notice in allen User-facing KI-Outputs",
    note: "Nutzer werden bei jeder KI-Interaktion informiert",
  },
  {
    id: "art9",
    article: "Art. 9 EU AI Act",
    requirement: "Risikomanagementsystem",
    status: "pending",
    note: "Formales Risikomanagement-ISMS in Aufbau (Vanta/ISO 27001)",
  },
  {
    id: "art17",
    article: "Art. 17 EU AI Act",
    requirement: "Qualitätsmanagementsystem",
    status: "partial",
    evidence: "CI/CD, E2E-Tests, RAG-Eval, Release-Gates",
    note: "ISO 42001-konformes QMS in Aufbau",
  },
  {
    id: "art26",
    article: "Art. 26 EU AI Act",
    requirement: "Pflichten der Betreiber von Hochrisiko-KI-Systemen",
    status: "partial",
    note: "Betreiber-Dokumentation und Meldepflichten werden implementiert",
  },
];

const STATUS_CONFIG = {
  compliant: {
    icon: CheckCircle,
    color: "#22c55e",
    label: "Konform",
    bg: "#22c55e15",
    border: "#22c55e30",
  },
  partial: {
    icon: AlertTriangle,
    color: "#f59e0b",
    label: "Teilweise",
    bg: "#f59e0b15",
    border: "#f59e0b30",
  },
  pending: {
    icon: AlertTriangle,
    color: "#6366f1",
    label: "In Arbeit",
    bg: "#6366f115",
    border: "#6366f130",
  },
  not_started: {
    icon: XCircle,
    color: "#ef4444",
    label: "Ausstehend",
    bg: "#ef444415",
    border: "#ef444430",
  },
};

export default function AIActConformityPage() {
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
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0" }}>
            EU AI Act — Konformitätserklärung
          </h1>
        </div>
        <p style={{ fontSize: 13, color: "#8a8aa8", lineHeight: 1.6 }}>
          Subsumio ist als KI-gestütztes Rechtsinformationssystem gemäß EU AI Act (VO 2024/1689)
          potenziell als Hochrisiko-KI nach Annex III Nr. 8 (Rechtspflege und demokratische
          Prozesse) einzustufen. Diese Seite dokumentiert den aktuellen Konformitätsstatus und die
          laufenden Maßnahmen zur vollständigen Compliance.
        </p>
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
          <strong>Hinweis:</strong> Der EU AI Act ist ab August 2026 für Hochrisiko-Systeme
          vollständig anwendbar. Dieses Dokument wird laufend aktualisiert.
        </div>
      </div>

      {/* Status Overview */}
      <Section title="Konformitäts-Übersicht" icon={<Info size={15} />}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <StatCard value={compliantCount} label="Konform" color="#22c55e" />
          <StatCard value={partialCount} label="Teilweise" color="#f59e0b" />
          <StatCard value={pendingCount} label="Ausstehend" color="#6366f1" />
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
      <Section title="1. System-Klassifizierung" icon={<FileText size={15} />}>
        <p style={{ fontSize: 12, color: "#a0a0c0", lineHeight: 1.6, marginBottom: 12 }}>
          Subsumio unterstützt Rechtsanwältinnen und Rechtsanwälte bei der Analyse von Verträgen,
          Recherche von Rechtsprechung, Fristüberwachung und Erstellung von Schriftsätzen. Nach
          Annex III Nr. 8 EU AI Act gelten KI-Systeme als Hochrisiko, wenn sie für die Rechtspflege
          eingesetzt werden und die Auslegung von Sachverhalten und Gesetzen oder die Anwendung des
          Rechts auf konkrete Sachverhalte unterstützen.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          <ClassificationRow label="Annex III Kategorie" value="Nr. 8 — Rechtspflege" />
          <ClassificationRow label="Risikoniveau" value="Potenziell Hochrisiko (in Prüfung)" />
          <ClassificationRow label="Anwendungsbereich" value="DACH-Rechtsraum (AT, DE, CH, EU)" />
          <ClassificationRow
            label="Zielgruppe"
            value="Zugelassene Rechtsanwältinnen und Rechtsanwälte"
          />
          <ClassificationRow
            label="Keine Entscheidungsautonomie"
            value="Alle Ausgaben sind Entscheidungsunterstützung, kein Ersatz für menschliches Urteil"
          />
        </div>
      </Section>

      {/* Technical Documentation */}
      <Section title="2. Technische Dokumentation (Art. 11)" icon={<FileText size={15} />}>
        <div style={{ display: "grid", gap: 6 }}>
          {[
            {
              label: "Allgemeine Systembeschreibung",
              done: true,
              where: "CLAUDE.md, docs/PRODUCT_CAPABILITIES.md",
            },
            { label: "Trainingsdata-Beschreibung", done: false, where: "In Erstellung" },
            {
              label: "Validierungs- und Testverfahren",
              done: true,
              where: "RAG-Eval, BrainBench, E2E-Tests (1.515 Testdateien)",
            },
            {
              label: "Leistungsmetriken und -grenzen",
              done: true,
              where: "docs/eval/SEARCH_MODE_METHODOLOGY.md, METRIC_GLOSSARY.md",
            },
            {
              label: "Risikomanagement-Dokumentation",
              done: false,
              where: "Vanta/ISO 27001 in Aufbau",
            },
            {
              label: "Annex IV-konforme Vollständige Dokumentation",
              done: false,
              where: "Geplant Q3 2026",
            },
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
      <Section title="3. Menschliche Aufsicht (Art. 14)" icon={<Eye size={15} />}>
        <p style={{ fontSize: 12, color: "#a0a0c0", lineHeight: 1.6, marginBottom: 12 }}>
          Subsumio implementiert mehrere technische und organisatorische Maßnahmen zur
          Sicherstellung menschlicher Aufsicht über alle KI-gestützten Entscheidungen:
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {[
            {
              title: "Citation-Gate",
              desc: "Alle Legal-AI-Outputs enthalten zwingend Quellenangaben mit Zitaten aus dem Kanzlei-Brain — keine unkontrollierten Halluzinationen",
              status: "✅ Implementiert",
            },
            {
              title: "Human Review Queue",
              desc: "Kritische KI-Ausgaben können für menschliche Überprüfung markiert und in die Review-Queue eskaliert werden",
              status: "✅ Implementiert",
            },
            {
              title: "AI-Notice in Outputs",
              desc: "Jede KI-generierte Ausgabe ist für den Nutzer klar als solche erkennbar (AIActConformityBanner)",
              status: "✅ Implementiert",
            },
            {
              title: "Release-Gate",
              desc: "Neue Modell-Versionen und AI-Features werden gegen definierte Qualitäts-Gates geprüft bevor sie live gehen",
              status: "✅ Implementiert",
            },
            {
              title: "Audit-Trail",
              desc: "Jede KI-Interaktion wird mit Nutzer, Zeitstempel und Kontext im Audit-Log erfasst",
              status: "✅ Implementiert",
            },
            {
              title: "Ethical-Wall",
              desc: "AI-Provider-Richtlinien (EU-only Modelle, opt-out von Training) sind konfigurierbar pro Organisation",
              status: "✅ Implementiert",
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
      <Section title="4. Transparenz (Art. 52)" icon={<Users size={15} />}>
        <p style={{ fontSize: 12, color: "#a0a0c0", lineHeight: 1.6, marginBottom: 12 }}>
          Art. 52 EU AI Act verpflichtet zu eindeutiger Kennzeichnung KI-generierter Inhalte.
          Subsumio implementiert dies durch:
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
            Beispiel-Banner (alle Legal-AI-Outputs):
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
            KI-Analyse (Vertragsanalyse) — EU AI Act konform · Menschliche Überprüfung empfohlen
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#a0a0c0", lineHeight: 1.6 }}>
          Die Komponente{" "}
          <code
            style={{ background: "#1e1e3a", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}
          >
            AIActConformityBanner
          </code>{" "}
          ist in allen Legal-AI-Routes als Standard eingebettet. Nutzer können den Banner ausklappen
          und erhalten Informationen zu System, Verwendungszweck und Möglichkeiten der menschlichen
          Überprüfung.
        </div>
      </Section>

      {/* Conformity Status Detail */}
      <Section title="5. Anforderungs-Status im Detail" icon={<ShieldCheck size={15} />}>
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
                      {item.requirement}
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
                          Nachweis
                        </div>
                        <div style={{ fontSize: 12, color: "#c0c0d8" }}>{item.evidence}</div>
                      </div>
                    )}
                    {item.note && (
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
                          Hinweis
                        </div>
                        <div style={{ fontSize: 12, color: "#a0a0c0" }}>{item.note}</div>
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
      <Section title="6. Zertifizierungs-Roadmap" icon={<ShieldCheck size={15} />}>
        <p style={{ fontSize: 12, color: "#a0a0c0", lineHeight: 1.6, marginBottom: 12 }}>
          Für eine vollständige EU AI Act-Konformität und den Nachweis gegenüber Kanzlei-Kunden sind
          folgende Zertifizierungen in Vorbereitung:
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {[
            {
              cert: "SOC 2 Type II",
              status: "Vanta-Onboarding geplant Juli 2026",
              eta: "Q2 2027",
              color: "#6366f1",
            },
            {
              cert: "ISO 27001:2022",
              status: "TÜV Rheinland Angebotsanfrage in Vorbereitung",
              eta: "Q3 2027",
              color: "#6366f1",
            },
            {
              cert: "ISO 42001:2023 (AI Management)",
              status: "Parallel zu ISO 27001",
              eta: "Q3 2027",
              color: "#6366f1",
            },
            {
              cert: "DSGVO-Konformitätserklärung",
              status: "Teilweise vorhanden, vollständige Erklärung in Erstellung",
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
            <ExternalLink size={12} /> Vollständige Zertifizierungs-Roadmap
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
        Letzte Aktualisierung: Juni 2026 · Verantwortlich: Subsumio GmbH · Fragen zur Compliance:{" "}
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
