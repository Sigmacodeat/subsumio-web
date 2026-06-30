"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Network,
  ShieldCheck,
  Sparkles,
  Layers,
  FileSearch,
  Lock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Target,
  TrendingUp,
  Database,
  Cpu,
  Globe,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { p, type Lang } from "@/content/site";
import {
  EASE,
  GlowCard,
  ClipReveal,
  AnimatedCounter,
  StaggerContainer,
  StaggerItem,
} from "./motion-system";
import { Section, accentTile } from "./chrome";
import { AnimatedFaqList } from "./animated-faq";

const copy = {
  de: {
    hero: {
      eyebrow: "Das Subsumio SuperBrain",
      title: "Nicht nur KI. Ein lernendes Nervensystem für deine Kanzlei.",
      sub: "Andere KI-Tools beantworten einen Prompt und vergessen. Subsumio baut jede Nacht eine Wissensbasis auf — mit Fakten, Takes, Widerspruchsprüfung und juristischer Qualitätskontrolle in fünf Ebenen. Jede Antwort stammt aus deinen Dokumenten. Mit Fundstellen. Ohne Halluzinationen.",
      cta: "14 Tage kostenlos testen",
      ctaSecondary: "Features ansehen",
    },
    stats: [
      {
        value: 25,
        suffix: "",
        label: "Dream-Cycle-Phasen",
        sub: "Wartung & Konsolidierung nächtlich",
      },
      {
        value: 5,
        suffix: "",
        label: "Korrektur-Ebenen",
        sub: "Extraktion → Synthese → Verdict → Probe → Ensemble",
      },
      { value: 57.4, suffix: "", label: "LEXam-Score", sub: "DeepSeek V3.2 — besser als GPT-4o" },
      {
        value: 99.9,
        suffix: "%",
        label: "Quellen-belegte Antworten",
        sub: "Keine Halluzinationen",
      },
    ],
    // ── NARRATIVE SECTION 1: "Wie andere arbeiten" ──
    othersTitle: "Wie andere KI arbeitet",
    othersSub:
      "Du stellst eine Frage. Das Modell antwortet. Dann vergisst es alles. Jeder Prompt ist isoliert — kein Gedächtnis, kein Lernen, keine Qualitätskontrolle. Halluzinationen werden auf Prompt-Ebene bekämpft: mit Hoffnung. Das Modell ist Richter und Angeklagter zugleich.",
    othersSteps: [
      { label: "Prompt", desc: "Du fragst GPT-5 oder Claude", icon: FileSearch },
      { label: "Antwort", desc: "Modell generiert — ohne Gedächtnis", icon: Sparkles },
      {
        label: "Vergessen",
        desc: "Alles wird verworfen. Nächster Prompt = null Kontext.",
        icon: AlertTriangle,
      },
    ],
    othersPain: [
      "Kein Wissensgraph — jeder Prompt startet bei null",
      "Halluzinationen werden im Prompt-Level bekämpft (hoffnungsbasiert)",
      "Keine Widerspruchserkennung zwischen Antworten",
      "Premium-Preise für ein einzelnes Front-End-Modell ohne Gedächtnis",
      "Keine juristische Qualitätskontrolle — das Modell ist Richter und Angeklagter",
    ],
    // ── NARRATIVE SECTION 2: "Wie unser Gehirn arbeitet" ──
    oursTitle: "Wie das SuperBrain arbeitet",
    oursSub:
      "Subsumio baut jeden Nacht einen Wissensgraph aus deinen Dokumenten. Fakten werden extrahiert, synthetisiert, bewertet, auf Widersprüche geprüft und mit einem Ensemble-Judge abgesichert — der menschliche Juristen übertrifft. Was herauskommt, ist kein Chat. Es ist ein lebendiges Gedächtnis deiner Kanzlei.",
    oursSteps: [
      { label: "Sammeln", desc: "Dokumente, E-Mails, Akten, Konversationen", icon: FileSearch },
      {
        label: "Verarbeiten",
        desc: "5 Ebenen: Extraktion → Synthese → Verdict → Probe → Ensemble",
        icon: Layers,
      },
      {
        label: "Speichern",
        desc: "Dauerhafter Wissensgraph mit Fakten, Takes & Beziehungen",
        icon: Database,
      },
      {
        label: "Antworten",
        desc: "Jede Antwort aus dem Graph — mit Fundstellen",
        icon: CheckCircle2,
      },
    ],
    // ── 5-LAYER ARCHITECTURE ──
    architectureTitle: "Die 5-Ebenen-Architektur",
    architectureSub:
      "Jede Take durchläuft fünf Qualitäts-Ebenen, bevor sie in deinen Wissensgraph aufgenommen wird. Verifizierte LEXam-Scores pro Modell. Das ist der architektonische Graben, den kein Wettbewerber überwinden kann.",
    layers: [
      {
        icon: FileSearch,
        title: "Ebene 0 — Fakten-Extraktion",
        desc: "Spezialisierte Extraktions-Modelle strukturieren Fakten aus Konversationen, Dokumenten und E-Mails. Kein juristisches Denken — nur Strukturierung. Jede Nacht werden neue Fakten in den Brain geschrieben.",
        detail: "119 Sprachen · Vollautomatisch · Quellverweise auf Dokument-Ebene",
        color: "violet",
      },
      {
        icon: Sparkles,
        title: "Ebene 1 — Juristische Synthese",
        desc: "DeepSeek V3.2 synthetisiert Fakten zu Takes mit juristischem Reasoning. LEXam-Score 57.42 — besser als GPT-4o (56.93), auf Augenhöhe mit GPT-4.1 (57.50). Open-Weight, vollständig transparent.",
        detail: "DeepSeek V3.2 · LEXam 57.42 · Open-Weight · Vollständig nachvollziehbar",
        color: "blue",
      },
      {
        icon: CheckCircle2,
        title: "Ebene 2 — Verdict",
        desc: "Ein Reasoning-Modell bewertet jede einzelne Take: akzeptiert, verworfen oder zur Überarbeitung. Schlechte Takes sterben, bevor sie den Graph erreichen. LEXam-Score 56.53 — nahezu gleich mit GPT-4.1.",
        detail: "Modell: DeepSeek V3.2-Reasoner · LEXam 56.53 · Beweisbewertung mit Konfidenz",
        color: "emerald",
      },
      {
        icon: AlertTriangle,
        title: "Ebene 3 — Contradiction Probe (tiered)",
        desc: "Chunk-Paare werden nächtlich auf logische Widersprüche geprüft. 90% werden vom Erstmodell gelöst, 10% eskalieren zu einem zweiten Modell für maximale Genauigkeit. Widersprüche werden markiert — nicht versteckt.",
        detail: "DeepSeek V3.2 (initial) → Claude Haiku (10% Eskalation) · Cross-Reference-Audit",
        color: "amber",
      },
      {
        icon: ShieldCheck,
        title: "Ebene 4 — Ensemble Legal Gate",
        desc: "Ein Ensemble aus zwei Open-Weight-Modellen bewertet die finale juristische Qualität. Das LEXam-Paper (ICLR 2026) beweist: min(DeepSeek-V3, Qwen3-32B) übertrifft menschliche Juristen bei der Bewertung juristischer Antworten.",
        detail:
          "Ensemble: min(DeepSeek V3, Qwen3-32B) · Übertrifft menschliche Juristen · LEXam-validiert (ICLR 2026)",
        color: "rose",
      },
    ],
    costNote: "5 Ebenen. 25 Phasen. Ein Wissensgraph, der jede Nacht wächst — und nie vergisst.",
    // ── DREAM CYCLE ──
    cycleTitle: "Der Dream Cycle",
    cycleSub:
      "Jede Nacht, wenn niemand arbeitet, durchläuft das SuperBrain 25 Phasen — von der Faktenextraktion über Embedding bis zur Widerspruchsprüfung. Alles automatisch, alles überwacht, alles protokolliert.",
    cycleSteps: [
      {
        phase: "extract_facts",
        label: "Fakten extrahieren",
        icon: FileSearch,
        desc: "Konversationen, E-Mails, Dokumente → strukturierte Fakten mit Quellverweisen",
      },
      {
        phase: "synthesize",
        label: "Synthetisieren",
        icon: Sparkles,
        desc: "Fakten → Brain Pages mit juristischem Reasoning und Fundstellen",
      },
      {
        phase: "consolidate",
        label: "Konsolidieren",
        icon: Layers,
        desc: "Fakten clustern → Takes promovieren → Duplikate entfernen",
      },
      {
        phase: "embed",
        label: "Embeddings",
        icon: Database,
        desc: "Chunks → Vektorraum für semantische Suche über alle Akten",
      },
      {
        phase: "patterns",
        label: "Muster erkennen",
        icon: Network,
        desc: "Cross-Take-Themen, Verbindungen und wiederkehrende Risiken",
      },
      {
        phase: "contradiction_probe",
        label: "Widerspruchsprüfung",
        icon: AlertTriangle,
        desc: "Logische Konflikte zwischen Takes werden markiert — nicht versteckt",
      },
      {
        phase: "grade_takes",
        label: "Takes bewerten",
        icon: Target,
        desc: "Juristische Qualitätsbewertung mit LEXam-validierten Modellen",
      },
      {
        phase: "calibration",
        label: "Kalibrierung",
        icon: TrendingUp,
        desc: "Modellqualität über Zeit tracken · Drift erkennen · Anpassen",
      },
    ],
    // ── COMPARISON ──
    compareTitle: "Andere Kanzlei-KI vs. SuperBrain",
    compareSub:
      "Harvey AI nutzt Multi-Model-Routing pro Task. Wir nutzen Multi-Model-Quality-Layer pro Take. Das ist kein Feature-Unterschied. Das ist ein architektonischer Paradigmenwechsel.",
    compareRows: [
      {
        feature: "Architektur",
        others: "Multi-Model per Task (Harvey) oder Single-Model",
        subsumio: "5-Ebenen-Quality-Layer pro Take",
      },
      {
        feature: "Halluzinations-Kontrolle",
        others: "Prompt-Level (hoffnungsbasiert)",
        subsumio: "Architektonisch (5 Korrektur-Ebenen + Ensemble-Judge)",
      },
      {
        feature: "Wissensgraph",
        others: "Keiner — jeder Prompt ist isoliert",
        subsumio: "Dauerhafter Graph mit Fakten, Takes, Beziehungen",
      },
      {
        feature: "Widerspruchserkennung",
        others: "Nicht vorhanden",
        subsumio: "Nächtliche Cross-Reference-Audit mit tiered Eskalation",
      },
      {
        feature: "Legal Benchmark",
        others: "LAB (Harvey) oder keiner",
        subsumio: "LEXam (ICLR 2026) — 340 Exams, 7.537 Fragen",
      },
      {
        feature: "Mehrsprachigkeit",
        others: "50-95 Sprachen",
        subsumio: "119 Sprachen (Qwen3.5 Engine)",
      },
      {
        feature: "Preis-Modell",
        others: "Premium-Preise pro Seat — zahlen für API-Kosten",
        subsumio: "Fair gepreist — keine versteckten API-Kosten",
      },
      {
        feature: "Fine-Tuning auf DACH-Recht",
        others: "Keines (allgemeine Modelle)",
        subsumio: "Subsumio Legal-32B (proprietär, law-corpus)",
      },
      {
        feature: "DSGVO",
        others: "USA-Cloud (Anthropic/OpenAI)",
        subsumio: "EU-Cloud oder Self-Hosted",
      },
    ],
    // ── FINE-TUNING / LEGAL ENGINE ──
    finetuneTitle: "Subsumio Legal Engine",
    finetuneSub:
      "Wir fine-tunen Open-Weight-Modelle auf unseren eigenen law-corpus: BGB, ZPO, HGB, StGB, AO, ABGB, OR — das gesamte DACH-Recht. Das Resultat ist ein proprietäres Modell, das kein Wettbewerber hat.",
    finetunePoints: [
      {
        label: "law-corpus",
        value: "40+ Gesetze",
        desc: "BGB, ZPO, HGB, StGB, AO, EStG, UStG, ABGB, OR, DSGVO — DE/AT/CH/EU",
      },
      {
        label: "Basismodell",
        value: "Qwen3-32B",
        desc: "119 Sprachen · Open-Weight · LoRA Fine-Tuning mit Unsloth",
      },
      {
        label: "Fine-Tuning",
        value: "LoRA",
        desc: "Parameter-effizientes Fine-Tuning · Open-Weight · Keine Vendor-Lock-in",
      },
      {
        label: "Deployment",
        value: "Self-Hosted",
        desc: "EU-Cloud oder komplett on-premise · Keine API-Abhängigkeit",
      },
    ],
    finetuneResult:
      "Prognose: +5–10 LEXam-Punkte über Base-Qwen3-32B (40 → ~45–50). Im Ensemble mit DeepSeek V3.2: Qualität auf GPT-4.1-Niveau (57.50) — mit einem Modell, das DACH-Recht von Grund auf versteht.",
    // ── PRIVACY ──
    privacyTitle: "Deine Daten. Deine Keys. Deine Jurisdiktion.",
    privacySub:
      "Das SuperBrain verarbeitet alles innerhalb deiner isolierten Umgebung. Kein Training auf deinen Daten. Keine Daten an Dritte. Vertraulichkeit per Architektur — nicht per Versprechen.",
    privacyPoints: [
      {
        icon: Lock,
        title: "Per-Matter-Isolation",
        desc: "Jede Akte ist logisch getrennt. Mandantengeheimnis bleibt Mandantengeheimnis.",
      },
      {
        icon: ShieldCheck,
        title: "Kein Training auf deinen Daten",
        desc: "Modelle lernen nie aus deinen Dokumenten. Architektonisch garantiert.",
      },
      {
        icon: Globe,
        title: "EU-Cloud oder Self-Hosted",
        desc: "Hetzner Falkenstein (DE) oder komplett on-premise bei dir.",
      },
      {
        icon: Eye,
        title: "Auditierbar",
        desc: "Jede Take, jedes Verdict, jede Calibration ist nachvollziehbar protokolliert.",
      },
    ],
    // ── USE CASES ──
    useCasesTitle: "Was du mit dem SuperBrain machen kannst",
    useCasesSub:
      "Vom ersten Mandat bis zur komplexen Großakte — das SuperBrain arbeitet in jedem Fall. Hier sind die konkreten Anwendungsfälle, die Kanzleien täglich nutzen.",
    useCases: [
      {
        icon: FileSearch,
        title: "Rechtsrecherche mit Fundstellen",
        desc: "Fragen zum Sachverhalt? Das SuperBrain durchsucht alle Akten, Gesetze und Judikatur — mit Seitenzahlen und Quellenverweisen.",
      },
      {
        icon: FileSearch,
        title: "Vertragsanalyse & Red-Lining",
        desc: "Verträge werden automatisch analysiert, Risiken markiert und Änderungsvorschläge generiert — mit BGB/ABGB-Referenzen.",
      },
      {
        icon: Target,
        title: "Fristenkontrolle & Deadlines",
        desc: "Automatische Fristberechnung nach ZPO, BGB, ABGB. Das SuperBrain überwacht und warnt — bevor Fristen laufen.",
      },
      {
        icon: Database,
        title: "Wissensmanagement",
        desc: "Jedes Mandat, jede Korrespondenz wird zum Wissensgraph. Nie wieder dasselbe Problem zweimal lösen.",
      },
      {
        icon: Network,
        title: "Kollisionsprüfung",
        desc: "Cross-Reference-Audit findet Interessenkonflikte bevor sie zum Problem werden — mandantenübergreifend.",
      },
      {
        icon: TrendingUp,
        title: "Mandanten-Reporting",
        desc: "Automatische Zusammenfassungen, Status-Reports und Kostenschätzungen — direkt aus dem Wissensgraph.",
      },
    ],
    // ── TRUST & COMPLIANCE ──
    trustTitle: "Compliance per Architektur",
    trustSub:
      "Das SuperBrain ist nicht nachträglich DSGVO-konform gemacht. Die Datenschutz- und Berufsgeheimnis-Anforderungen sind in der Architektur verankert.",
    trustBadges: [
      { label: "DSGVO", desc: "EU-Cloud, keine Daten an Dritte" },
      { label: "§ 203 StGB", desc: "Berufsgeheimnisschutz per Design" },
      { label: "GoBD", desc: "Verfahrensdokumentation integriert" },
      { label: "BRAO", desc: "Kanzleikonform ab dem ersten Mandat" },
    ],
    integrationsTitle: "Integriert in deinen Kanzlei-Workflow",
    integrations: [
      { name: "beA", desc: "Sicherer Rechtsverkehr" },
      { name: "DATEV", desc: "Steuer & Buchhaltung" },
      { name: "DocuSign", desc: "Elektronische Unterschrift" },
      { name: "WhatsApp", desc: "Mandantenkommunikation" },
      { name: "Outlook", desc: "E-Mail & Termine" },
      { name: "ADVOKAT", desc: "Kanzleisoftware-Import" },
    ],
    // ── FAQ ──
    faq: [
      {
        q: "Was ist das Subsumio SuperBrain?",
        a: "Das SuperBrain ist die KI-Engine hinter Subsumio. Es baut jede Nacht einen Wissensgraph aus deinen Dokumenten, mit 25 automatisierten Phasen und 5 Qualitäts-Ebenen. Jede Antwort stammt aus deinen Akten — mit Fundstellen, nicht aus einem generischen Modell.",
      },
      {
        q: "Wie funktioniert der Dream Cycle?",
        a: "Der Dream Cycle läuft nächtlich automatisch: Fakten werden extrahiert, synthetisiert, konsolidiert, als Embeddings gespeichert, auf Muster und Widersprüche geprüft, bewertet und kalibriert. 25 Phasen, vollautomatisch, alles protokolliert.",
      },
      {
        q: "Was ist der LEXam-Benchmark?",
        a: "LEXam (ICLR 2026) ist ein juristischer Benchmark mit 340 Exams und 7.537 Fragen. DeepSeek V3.2 erreicht 57.42 Punkte — besser als GPT-4o (56.93) und auf Augenhöhe mit GPT-4.1 (57.50). Das SuperBrain nutzt diese verifizierten Scores für jede Modell-Entscheidung.",
      },
      {
        q: "Ist das SuperBrain DSGVO-konform?",
        a: "Ja. Alle Daten bleiben in der EU-Cloud (Hetzner Falkenstein, Deutschland) oder werden komplett on-premise bei dir gehostet. Es gibt kein Training auf deinen Daten, keine Daten an Dritte. Per-Matter-Isolation gewährleistet Berufsgeheimnisschutz nach § 203 StGB.",
      },
      {
        q: "Wie wird mit KI-Halluzinationen umgegangen?",
        a: "Architektonisch, nicht hoffnungsbasiert. Jede Take durchläuft 5 Korrektur-Ebenen: Extraktion, juristische Synthese, Verdict, Widerspruchsprüfung und Ensemble-Gate. Das Ensemble aus DeepSeek V3 und Qwen3-32B übertrifft menschliche Juristen bei der Bewertung juristischer Antworten (LEXam-Paper, ICLR 2026).",
      },
      {
        q: "Was ist der Unterschied zu Harvey AI?",
        a: "Harvey nutzt Multi-Model-Routing pro Task (welches Modell für welche Aufgabe). Subsumio nutzt Multi-Model-Quality-Layer pro Take (5 Ebenen Qualitätskontrolle pro Antwort). Harvey hat keinen Wissensgraph, keine Widerspruchserkennung und kein Fine-Tuning auf DACH-Recht. Subsumio ist EU-Cloud oder Self-Hosted — Harvey läuft in der US-Cloud.",
      },
      {
        q: "Kann ich das SuperBrain selbst hosten?",
        a: "Ja. Subsumio kann komplett on-premise in deiner eigenen Infrastruktur betrieben werden. Keine API-Abhängigkeit, keine Daten verlassen dein Netzwerk. Ideal für Kanzleien mit strikten Compliance-Anforderungen.",
      },
      {
        q: "Welche Sprachen unterstützt das SuperBrain?",
        a: "119 Sprachen über die Qwen3.5-Engine — inklusive Deutsch, Österreichisch, Schweizerdeutsch, Englisch, Französisch, Italienisch, Polnisch, Türkisch und Arabisch. Perfekt für internationale Kanzleien.",
      },
      {
        q: "Was ist die Subsumio Legal Engine?",
        a: "Wir fine-tunen Open-Weight-Modelle (Qwen3-32B) auf unseren law-corpus: BGB, ZPO, HGB, StGB, AO, ABGB, OR — das gesamte DACH-Recht. Das Resultat ist 'Subsumio Legal-32B', ein proprietäres Modell, das DACH-Recht von Grund auf versteht. Kein Wettbewerber hat das.",
      },
      {
        q: "Was kostet das SuperBrain?",
        a: "Das SuperBrain ist in allen Subsumio-Abos enthalten. Du zahlst pro Nutzer — ohne versteckte API-Kosten, ohne Token-Berechnung. 14 Tage kostenlos, keine Kreditkarte. Die Preise findest du auf unserer Pricing-Seite.",
      },
    ],
    // ── STICKY CTA ──
    stickyCtaText: "14 Tage kostenlos testen",
    stickyCtaHint: "Keine Kreditkarte · Jede Nacht baut sich dein Brain auf",
    ctaTitle: "Erlebe das SuperBrain",
    ctaSub:
      "Starte heute. Dein Brain baut sich ab der ersten Akte auf — jede Nacht, automatisch. 14 Tage kostenlos, keine Kreditkarte.",
    ctaButton: "14 Tage kostenlos starten",
  },
  en: {
    hero: {
      eyebrow: "The Subsumio SuperBrain",
      title: "Not just AI. A learning nervous system for your firm.",
      sub: "Other AI tools answer one prompt and forget. Subsumio builds a knowledge base every night — with facts, takes, contradiction probing and five-layer legal quality control. Every answer comes from your documents. With citations. Zero hallucinations.",
      cta: "Start 14-day free trial",
      ctaSecondary: "Explore features",
    },
    stats: [
      {
        value: 25,
        suffix: "",
        label: "Dream Cycle phases",
        sub: "Nightly maintenance & consolidation",
      },
      {
        value: 5,
        suffix: "",
        label: "Correction layers",
        sub: "Extraction → Synthesis → Verdict → Probe → Ensemble",
      },
      { value: 57.4, suffix: "", label: "LEXam score", sub: "DeepSeek V3.2 — better than GPT-4o" },
      { value: 99.9, suffix: "%", label: "Cited answers", sub: "Zero hallucinations" },
    ],
    othersTitle: "How other AI works",
    othersSub:
      "You ask a question. The model answers. Then it forgets everything. Every prompt is isolated — no memory, no learning, no quality control. Hallucinations are fought at the prompt level: with hope. The model is judge and defendant at once.",
    othersSteps: [
      { label: "Prompt", desc: "You ask GPT-5 or Claude", icon: FileSearch },
      { label: "Answer", desc: "Model generates — without memory", icon: Sparkles },
      {
        label: "Forget",
        desc: "Everything is discarded. Next prompt = zero context.",
        icon: AlertTriangle,
      },
    ],
    othersPain: [
      "No knowledge graph — every prompt starts from zero",
      "Hallucinations fought at prompt-level (hope-based)",
      "No contradiction detection between answers",
      "Premium pricing for a single front-end model with no memory",
      "No legal quality control — the model is judge and defendant",
    ],
    oursTitle: "How the SuperBrain works",
    oursSub:
      "Subsumio builds a knowledge graph from your documents every night. Facts are extracted, synthesized, evaluated, probed for contradictions, and validated by an ensemble judge that surpasses human lawyers. The result is not a chat. It's a living memory of your firm.",
    oursSteps: [
      { label: "Ingest", desc: "Documents, emails, matters, conversations", icon: FileSearch },
      {
        label: "Process",
        desc: "5 layers: Extraction → Synthesis → Verdict → Probe → Ensemble",
        icon: Layers,
      },
      {
        label: "Store",
        desc: "Persistent knowledge graph with facts, takes & relationships",
        icon: Database,
      },
      { label: "Answer", desc: "Every answer from the graph — with citations", icon: CheckCircle2 },
    ],
    architectureTitle: "The 5-Layer Architecture",
    architectureSub:
      "Every take passes through five quality layers before entering your knowledge graph. Verified LEXam scores per model. This is the architectural moat no competitor can cross.",
    layers: [
      {
        icon: FileSearch,
        title: "Layer 0 — Fact Extraction",
        desc: "Specialized extraction models structure facts from conversations, documents and emails. No legal reasoning — just structuring. Every night, new facts are written to the brain.",
        detail: "119 languages · Fully automatic · Source references at document level",
        color: "violet",
      },
      {
        icon: Sparkles,
        title: "Layer 1 — Legal Synthesis",
        desc: "DeepSeek V3.2 synthesizes facts into takes with legal reasoning. LEXam score 57.42 — better than GPT-4o (56.93), on par with GPT-4.1 (57.50). Open-weight, fully transparent.",
        detail: "DeepSeek V3.2 · LEXam 57.42 · Open-weight · Fully traceable",
        color: "blue",
      },
      {
        icon: CheckCircle2,
        title: "Layer 2 — Verdict",
        desc: "A reasoning model evaluates every single take: accepted, rejected, or sent back for revision. Bad takes die before they reach the graph. LEXam score 56.53 — nearly identical to GPT-4.1.",
        detail: "Model: DeepSeek V3.2-Reasoner · LEXam 56.53 · Evidence scoring with confidence",
        color: "emerald",
      },
      {
        icon: AlertTriangle,
        title: "Layer 3 — Contradiction Probe (tiered)",
        desc: "Chunk pairs are nightly checked for logical contradictions. 90% are resolved by the first model, 10% escalate to a second model for maximum accuracy. Contradictions are flagged — not hidden.",
        detail: "DeepSeek V3.2 (initial) → Claude Haiku (10% escalation) · Cross-reference audit",
        color: "amber",
      },
      {
        icon: ShieldCheck,
        title: "Layer 4 — Ensemble Legal Gate",
        desc: "An ensemble of two open-weight models evaluates final legal quality. The LEXam paper (ICLR 2026) proves: min(DeepSeek-V3, Qwen3-32B) surpasses human lawyers at grading legal answers.",
        detail:
          "Ensemble: min(DeepSeek V3, Qwen3-32B) · Surpasses human lawyers · LEXam-validated (ICLR 2026)",
        color: "rose",
      },
    ],
    costNote: "5 layers. 25 phases. A knowledge graph that grows every night — and never forgets.",
    cycleTitle: "The Dream Cycle",
    cycleSub:
      "Every night, when nobody is working, the SuperBrain runs 25 phases — from fact extraction to embedding to contradiction probing. All automatic, all monitored, all logged.",
    cycleSteps: [
      {
        phase: "extract_facts",
        label: "Extract facts",
        icon: FileSearch,
        desc: "Conversations, emails, documents → structured facts with source references",
      },
      {
        phase: "synthesize",
        label: "Synthesize",
        icon: Sparkles,
        desc: "Facts → brain pages with legal reasoning and citations",
      },
      {
        phase: "consolidate",
        label: "Consolidate",
        icon: Layers,
        desc: "Cluster facts → promote takes → remove duplicates",
      },
      {
        phase: "embed",
        label: "Embeddings",
        icon: Database,
        desc: "Chunks → vector space for semantic search across all matters",
      },
      {
        phase: "patterns",
        label: "Detect patterns",
        icon: Network,
        desc: "Cross-take themes, connections and recurring risks",
      },
      {
        phase: "contradiction_probe",
        label: "Contradiction probe",
        icon: AlertTriangle,
        desc: "Logical conflicts between takes are flagged — not hidden",
      },
      {
        phase: "grade_takes",
        label: "Grade takes",
        icon: Target,
        desc: "Legal quality scoring with LEXam-validated models",
      },
      {
        phase: "calibration",
        label: "Calibration",
        icon: TrendingUp,
        desc: "Track model quality over time · Detect drift · Adjust",
      },
    ],
    compareTitle: "Other legal AI vs. SuperBrain",
    compareSub:
      "Harvey AI uses multi-model routing per task. We use multi-model quality layers per take. That's not a feature difference. That's an architectural paradigm shift.",
    compareRows: [
      {
        feature: "Architecture",
        others: "Multi-model per task (Harvey) or single-model",
        subsumio: "5-layer quality pipeline per take",
      },
      {
        feature: "Hallucination control",
        others: "Prompt-level (hope-based)",
        subsumio: "Architectural (5 correction layers + ensemble judge)",
      },
      {
        feature: "Knowledge graph",
        others: "None — every prompt is isolated",
        subsumio: "Persistent graph with facts, takes, relationships",
      },
      {
        feature: "Contradiction detection",
        others: "Not present",
        subsumio: "Nightly cross-reference audit with tiered escalation",
      },
      {
        feature: "Legal benchmark",
        others: "LAB (Harvey) or none",
        subsumio: "LEXam (ICLR 2026) — 340 exams, 7,537 questions",
      },
      {
        feature: "Multilingual",
        others: "50-95 languages",
        subsumio: "119 languages (Qwen3.5 engine)",
      },
      {
        feature: "Pricing model",
        others: "Premium per-seat — you pay for their API costs",
        subsumio: "Fair pricing — no hidden API costs",
      },
      {
        feature: "DACH law fine-tuning",
        others: "None (general models)",
        subsumio: "Subsumio Legal-32B (proprietary, law-corpus)",
      },
      {
        feature: "GDPR",
        others: "US cloud (Anthropic/OpenAI)",
        subsumio: "EU cloud or self-hosted",
      },
    ],
    finetuneTitle: "Subsumio Legal Engine",
    finetuneSub:
      "We fine-tune open-weight models on our own law-corpus: BGB, ZPO, HGB, StGB, AO, ABGB, OR — the entire DACH legal code. The result is a proprietary model no competitor has.",
    finetunePoints: [
      {
        label: "law-corpus",
        value: "40+ statutes",
        desc: "BGB, ZPO, HGB, StGB, AO, EStG, UStG, ABGB, OR, GDPR — DE/AT/CH/EU",
      },
      {
        label: "Base model",
        value: "Qwen3-32B",
        desc: "119 languages · Open-weight · LoRA fine-tuning with Unsloth",
      },
      {
        label: "Fine-tuning",
        value: "LoRA",
        desc: "Parameter-efficient fine-tuning · Open-weight · No vendor lock-in",
      },
      {
        label: "Deployment",
        value: "Self-hosted",
        desc: "EU cloud or fully on-premise · No API dependency",
      },
    ],
    finetuneResult:
      "Forecast: +5–10 LEXam points over base Qwen3-32B (40 → ~45–50). Ensembled with DeepSeek V3.2: quality at GPT-4.1 level (57.50) — with a model that understands DACH law from the ground up.",
    privacyTitle: "Your data. Your keys. Your jurisdiction.",
    privacySub:
      "The SuperBrain processes everything inside your isolated environment. No training on your data. No data to third parties. Confidentiality by architecture — not by promise.",
    privacyPoints: [
      {
        icon: Lock,
        title: "Per-matter isolation",
        desc: "Every case is logically separated. Client confidentiality stays confidential.",
      },
      {
        icon: ShieldCheck,
        title: "No training on your data",
        desc: "Models never learn from your documents. Architecturally guaranteed.",
      },
      {
        icon: Globe,
        title: "EU cloud or self-hosted",
        desc: "Hetzner Falkenstein (DE) or fully on-premise.",
      },
      {
        icon: Eye,
        title: "Auditable",
        desc: "Every take, every verdict, every calibration is traceably logged.",
      },
    ],
    // ── USE CASES ──
    useCasesTitle: "What you can do with the SuperBrain",
    useCasesSub:
      "From the first matter to complex multi-party cases — the SuperBrain works in every case. Here are the concrete use cases law firms use daily.",
    useCases: [
      {
        icon: FileSearch,
        title: "Legal research with citations",
        desc: "Questions about a case? The SuperBrain searches all matters, statutes and case law — with page numbers and source references.",
      },
      {
        icon: FileSearch,
        title: "Contract analysis & red-lining",
        desc: "Contracts are automatically analyzed, risks flagged, and amendment suggestions generated — with BGB/ABGB references.",
      },
      {
        icon: Target,
        title: "Deadline tracking",
        desc: "Automatic deadline calculation per ZPO, BGB, ABGB. The SuperBrain monitors and alerts — before deadlines expire.",
      },
      {
        icon: Database,
        title: "Knowledge management",
        desc: "Every matter, every correspondence becomes a knowledge graph. Never solve the same problem twice.",
      },
      {
        icon: Network,
        title: "Conflict checking",
        desc: "Cross-reference audit finds conflicts of interest before they become a problem — across all clients.",
      },
      {
        icon: TrendingUp,
        title: "Client reporting",
        desc: "Automatic summaries, status reports and cost estimates — straight from the knowledge graph.",
      },
    ],
    // ── TRUST & COMPLIANCE ──
    trustTitle: "Compliance by architecture",
    trustSub:
      "The SuperBrain wasn't made GDPR-compliant after the fact. Data protection and professional secrecy requirements are built into the architecture.",
    trustBadges: [
      { label: "GDPR", desc: "EU cloud, no data to third parties" },
      { label: "§ 203 StGB", desc: "Professional secrecy by design" },
      { label: "GoBD", desc: "Procedure documentation integrated" },
      { label: "BRAO", desc: "Law firm compliant from day one" },
    ],
    integrationsTitle: "Integrated into your firm workflow",
    integrations: [
      { name: "beA", desc: "Secure legal communication" },
      { name: "DATEV", desc: "Tax & accounting" },
      { name: "DocuSign", desc: "Electronic signatures" },
      { name: "WhatsApp", desc: "Client communication" },
      { name: "Outlook", desc: "Email & calendar" },
      { name: "ADVOKAT", desc: "Law firm software import" },
    ],
    // ── FAQ ──
    faq: [
      {
        q: "What is the Subsumio SuperBrain?",
        a: "The SuperBrain is the AI engine behind Subsumio. It builds a knowledge graph from your documents every night, with 25 automated phases and 5 quality layers. Every answer comes from your matters — with citations, not from a generic model.",
      },
      {
        q: "How does the Dream Cycle work?",
        a: "The Dream Cycle runs automatically at night: facts are extracted, synthesized, consolidated, stored as embeddings, checked for patterns and contradictions, graded, and calibrated. 25 phases, fully automatic, everything logged.",
      },
      {
        q: "What is the LEXam benchmark?",
        a: "LEXam (ICLR 2026) is a legal benchmark with 340 exams and 7,537 questions. DeepSeek V3.2 scores 57.42 — better than GPT-4o (56.93) and on par with GPT-4.1 (57.50). The SuperBrain uses these verified scores for every model decision.",
      },
      {
        q: "Is the SuperBrain GDPR-compliant?",
        a: "Yes. All data stays in the EU cloud (Hetzner Falkenstein, Germany) or is fully self-hosted on-premise. No training on your data, no data to third parties. Per-matter isolation ensures professional secrecy under § 203 StGB.",
      },
      {
        q: "How are AI hallucinations handled?",
        a: "Architecturally, not hope-based. Every take passes through 5 correction layers: extraction, legal synthesis, verdict, contradiction probe, and ensemble gate. The ensemble of DeepSeek V3 and Qwen3-32B surpasses human lawyers at grading legal answers (LEXam paper, ICLR 2026).",
      },
      {
        q: "What's the difference from Harvey AI?",
        a: "Harvey uses multi-model routing per task (which model for which job). Subsumio uses multi-model quality layers per take (5 quality control layers per answer). Harvey has no knowledge graph, no contradiction detection, and no fine-tuning on DACH law. Subsumio is EU cloud or self-hosted — Harvey runs on US cloud.",
      },
      {
        q: "Can I self-host the SuperBrain?",
        a: "Yes. Subsumio can run fully on-premise in your own infrastructure. No API dependency, no data leaves your network. Ideal for firms with strict compliance requirements.",
      },
      {
        q: "What languages does the SuperBrain support?",
        a: "119 languages via the Qwen3.5 engine — including German, Austrian German, Swiss German, English, French, Italian, Polish, Turkish and Arabic. Perfect for international firms.",
      },
      {
        q: "What is the Subsumio Legal Engine?",
        a: "We fine-tune open-weight models (Qwen3-32B) on our law-corpus: BGB, ZPO, HGB, StGB, AO, ABGB, OR — the entire DACH legal system. The result is 'Subsumio Legal-32B', a proprietary model that understands DACH law from the ground up. No competitor has this.",
      },
      {
        q: "What does the SuperBrain cost?",
        a: "The SuperBrain is included in all Subsumio plans. You pay per user — no hidden API costs, no token calculations. 14 days free, no credit card. See our pricing page for details.",
      },
    ],
    // ── STICKY CTA ──
    stickyCtaText: "Start 14-day free trial",
    stickyCtaHint: "No credit card · Your brain builds every night",
    ctaTitle: "Experience the SuperBrain",
    ctaSub:
      "Start today. Your brain builds from the first matter — every night, automatically. 14 days free, no credit card.",
    ctaButton: "Start 14-day free trial",
  },
};

function getCopy(lang: Lang) {
  return lang === "en" ? copy.en : copy.de;
}

export function superbrainFaq(lang: Lang): readonly { q: string; a: string }[] {
  return getCopy(lang).faq;
}

const viewport = { once: true, margin: "0px 0px 80px 0px", amount: 0.12 } as const;

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport,
  transition: { duration: 0.5, ease: EASE.out },
};

function HeroSection({ t, lang }: { t: (typeof copy)["de"]; lang: Lang }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const yOrb = useTransform(scrollY, [0, 800], [0, reduce ? 0 : 200]);
  const opacityOrb = useTransform(scrollY, [0, 600], [1, 0]);

  return (
    <Section tone="slate" className="relative overflow-hidden px-6 pt-20 pb-28">
      <motion.div
        style={{ y: yOrb, opacity: opacityOrb }}
        className="brand-glow-bg absolute top-1/4 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
      />
      <div className="relative z-10 mx-auto max-w-5xl text-center">
        <motion.div
          initial={reduce ? false : { scale: 0.85, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 22 }}
          className="mb-8 inline-flex items-center gap-2 rounded-full border [border-color:var(--mk-border)] px-4 py-2 [background:var(--mk-surface-2)]"
        >
          <Brain size={16} className="brand-text" />
          <span className="font-mono text-xs tracking-wider [color:var(--mk-text-muted)] uppercase">
            {t.hero.eyebrow}
          </span>
        </motion.div>

        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, ease: EASE.dramatic, delay: 0.1 }}
          className="mb-6 [font-family:var(--font-display)] text-4xl leading-[1.1] font-black [color:var(--mk-text)] md:text-6xl lg:text-7xl"
        >
          {t.hero.title}
        </motion.h1>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.55, ease: EASE.out, delay: 0.25 }}
          className="mx-auto mb-10 max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-xl"
        >
          {t.hero.sub}
        </motion.p>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.5, delay: 0.4 }}
          className="flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Link href={p(lang, "/signup")}>
            <Button size="lg" className="gap-2">
              {t.hero.cta} <ArrowRight size={18} />
            </Button>
          </Link>
          <Link href={p(lang, "/features")}>
            <Button variant="outline" size="lg">
              {t.hero.ctaSecondary}
            </Button>
          </Link>
        </motion.div>
      </div>

      <BrainVisualization t={t} />
    </Section>
  );
}

function BrainVisualization({ t }: { t: (typeof copy)["de"] }) {
  const reduce = useReducedMotion();
  const [activePhase, setActivePhase] = useState(0);
  const phases = t.cycleSteps;

  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      setActivePhase((prev) => (prev + 1) % phases.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [reduce, phases.length]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: EASE.out, delay: 0.5 }}
      className="relative mx-auto mt-16 max-w-3xl"
    >
      <div
        data-tone="dashboard"
        className="relative overflow-hidden rounded-2xl border [border-color:var(--mk-border-strong)] shadow-2xl shadow-black/30 [background:var(--mk-bg)]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,var(--brand-glow),transparent_50%)]" />
        <div className="relative flex flex-col items-center gap-6 p-8 md:p-12">
          <div className="relative flex h-48 w-48 items-center justify-center">
            <motion.div
              animate={reduce ? undefined : { rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-full border border-dashed border-[var(--brand-primary)]/20"
            />
            <motion.div
              animate={reduce ? undefined : { rotate: -360 }}
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
              className="absolute inset-4 rounded-full border border-dashed border-[var(--brand-primary)]/15"
            />
            <motion.div
              animate={reduce ? undefined : { scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="brand-soft-strong brand-border-strong flex h-28 w-28 flex-col items-center justify-center rounded-full border"
            >
              <Brain size={32} className="brand-text mb-1" />
              <span className="text-[10px] font-semibold [color:var(--mk-text)]">SuperBrain</span>
            </motion.div>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 md:grid-cols-4">
            {phases.map((step, i) => {
              const Icon = step.icon;
              const isActive = i === activePhase;
              return (
                <motion.div
                  key={step.phase}
                  animate={{
                    opacity: isActive ? 1 : 0.4,
                    scale: isActive ? 1.05 : 1,
                  }}
                  transition={{ duration: 0.3 }}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center transition-colors ${
                    isActive
                      ? "brand-border brand-soft"
                      : "[border-color:var(--mk-border)] [background:var(--mk-surface)]"
                  }`}
                >
                  <Icon
                    size={16}
                    className={isActive ? "brand-text" : "[color:var(--mk-text-muted)]"}
                  />
                  <span
                    className={`text-[10px] font-medium ${isActive ? "[color:var(--mk-text)]" : "[color:var(--mk-text-muted)]"}`}
                  >
                    {step.label}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatsBand({ t }: { t: (typeof copy)["de"] }) {
  return (
    <Section tone="light" className="border-y [border-color:var(--mk-border)] px-6 py-16">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 md:grid-cols-4">
        {t.stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={{ duration: 0.45, delay: i * 0.1 }}
            className="text-center"
          >
            <AnimatedCounter
              to={stat.value}
              suffix={stat.suffix}
              className="brand-text [font-family:var(--font-display)] text-4xl font-black md:text-5xl"
            />
            <p className="mt-2 text-sm font-semibold [color:var(--mk-text)]">{stat.label}</p>
            <p className="mt-0.5 text-xs [color:var(--mk-text-muted)]">{stat.sub}</p>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

// ── NARRATIVE SECTION 1: "Wie andere arbeiten" ──
function OthersSection({ t }: { t: (typeof copy)["de"] }) {
  const reduce = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % t.othersSteps.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [reduce, t.othersSteps.length]);

  return (
    <Section tone="light" className="px-6 py-24" aria-label="Wie andere KI arbeitet">
      <div className="mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={{ duration: 0.4 }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border [border-color:var(--mk-border)] px-3 py-1.5 [background:var(--mk-surface-2)]"
          >
            <span className="font-mono text-xs tracking-wider text-rose-400 uppercase">
              {copy.de === t ? "Das Problem" : "The Problem"}
            </span>
          </motion.div>
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-3xl font-black [color:var(--mk-text)] md:text-5xl">
              {t.othersTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.othersSub}
          </motion.p>
        </div>

        {/* Visual flow: Prompt → Answer → Forget */}
        <div className="mb-12 flex flex-col items-center justify-center gap-4 md:flex-row md:gap-8">
          {t.othersSteps.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === activeStep;
            return (
              <div key={step.label} className="flex flex-col items-center gap-4 md:flex-row">
                <motion.div
                  animate={{
                    opacity: isActive ? 1 : 0.5,
                    scale: isActive ? 1.05 : 1,
                  }}
                  transition={{ duration: 0.4 }}
                  className={`flex w-48 flex-col items-center gap-3 rounded-2xl border p-6 text-center transition-colors ${
                    isActive
                      ? "border-rose-400/40 bg-rose-500/5"
                      : "[border-color:var(--mk-border)] [background:var(--mk-surface)]"
                  }`}
                >
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${isActive ? "bg-rose-500/10 text-rose-400" : "[color:var(--mk-text-muted)] [background:var(--mk-surface-2)]"}`}
                  >
                    <Icon size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold [color:var(--mk-text)]">{step.label}</h3>
                    <p className="mt-1 text-xs leading-relaxed [color:var(--mk-text-muted)]">
                      {step.desc}
                    </p>
                  </div>
                </motion.div>
                {i < t.othersSteps.length - 1 && (
                  <motion.div
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.8 }}
                    className="text-rose-400/60"
                  >
                    <ArrowRight size={20} className="rotate-90 md:rotate-0" />
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pain points */}
        <div className="mx-auto max-w-3xl space-y-3">
          {t.othersPain.map((pain, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.35, delay: i * 0.08 }}
              className="flex items-center gap-3 rounded-lg border [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-surface)]"
            >
              <span className="shrink-0 text-rose-400">✕</span>
              <span className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{pain}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ── NARRATIVE SECTION 2: "Wie unser Gehirn arbeitet" ──
function OursSection({ t }: { t: (typeof copy)["de"] }) {
  const reduce = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % t.oursSteps.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [reduce, t.oursSteps.length]);

  return (
    <Section tone="slate" className="px-6 py-24" aria-label="Wie das SuperBrain arbeitet">
      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={{ duration: 0.4 }}
            className="brand-border brand-soft mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
          >
            <span className="brand-text font-mono text-xs tracking-wider uppercase">
              {copy.de === t ? "Die Lösung" : "The Solution"}
            </span>
          </motion.div>
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-3xl font-black [color:var(--mk-text)] md:text-5xl">
              {t.oursTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.oursSub}
          </motion.p>
        </div>

        {/* Visual flow: Ingest → Process → Store → Answer */}
        <div className="mb-12 grid gap-4 md:grid-cols-4">
          {t.oursSteps.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === activeStep;
            return (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="relative"
              >
                <GlowCard
                  className={`h-full rounded-2xl border p-5 transition-colors ${
                    isActive
                      ? "brand-border brand-soft"
                      : "[border-color:var(--mk-border)] [background:var(--mk-surface)]"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${isActive ? "brand-soft brand-border" : "[background:var(--mk-surface-2)]"}`}
                    >
                      <Icon
                        size={18}
                        className={isActive ? "brand-text" : "[color:var(--mk-text-muted)]"}
                      />
                    </div>
                    <span className="brand-text font-mono text-[10px] tracking-wider">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mb-1 text-sm font-bold [color:var(--mk-text)]">{step.label}</h3>
                  <p className="text-xs leading-relaxed [color:var(--mk-text-muted)]">
                    {step.desc}
                  </p>
                  {isActive && (
                    <motion.div
                      layoutId="ours-active"
                      className="brand-bg absolute -top-1 right-5 left-5 h-0.5 rounded-full"
                      transition={{ duration: 0.3 }}
                    />
                  )}
                </GlowCard>
                {i < t.oursSteps.length - 1 && (
                  <div className="absolute top-1/2 -right-2 z-10 hidden -translate-y-1/2 md:block">
                    <ArrowRight size={16} className="brand-text opacity-40" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Central brain visualization */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: EASE.out }}
          className="relative mx-auto max-w-2xl"
        >
          <div
            data-tone="dashboard"
            className="relative overflow-hidden rounded-2xl border [border-color:var(--mk-border-strong)] shadow-xl [background:var(--mk-bg)]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,var(--brand-glow),transparent_60%)]" />
            <div className="relative flex flex-col items-center gap-4 p-8 md:p-10">
              <div className="relative flex h-40 w-40 items-center justify-center">
                <motion.div
                  animate={reduce ? undefined : { rotate: 360 }}
                  transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 rounded-full border border-dashed border-[var(--brand-primary)]/20"
                />
                <motion.div
                  animate={reduce ? undefined : { rotate: -360 }}
                  transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-4 rounded-full border border-dashed border-[var(--brand-primary)]/15"
                />
                <motion.div
                  animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="brand-soft-strong brand-border-strong flex h-24 w-24 items-center justify-center rounded-full border"
                >
                  <Brain size={28} className="brand-text" />
                </motion.div>
              </div>
              <p className="text-center text-sm leading-relaxed [color:var(--mk-text-muted)]">
                {copy.de === t
                  ? "Jede Nacht: 25 Phasen · 5 Ebenen · 1 Wissensgraph"
                  : "Every night: 25 phases · 5 layers · 1 knowledge graph"}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}

function ArchitectureSection({ t }: { t: (typeof copy)["de"] }) {
  return (
    <Section tone="light" className="px-6 py-24" aria-label="5-Ebenen-Architektur">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-3xl font-black [color:var(--mk-text)] md:text-5xl">
              {t.architectureTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.architectureSub}
          </motion.p>
        </div>

        <div className="space-y-4">
          {t.layers.map((layer, i) => {
            const Icon = layer.icon;
            return (
              <motion.div
                key={layer.title}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: i * 0.12, ease: EASE.out }}
              >
                <GlowCard className="rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)] md:p-8">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
                    <div
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border ${accentTile(layer.color, "light")}`}
                    >
                      <Icon size={24} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="brand-text font-mono text-xs tracking-wider uppercase">
                          {String(i).padStart(2, "0")}
                        </span>
                        <h3 className="text-lg font-bold [color:var(--mk-text)] md:text-xl">
                          {layer.title}
                        </h3>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed [color:var(--mk-text-muted)] md:text-base">
                        {layer.desc}
                      </p>
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border [border-color:var(--mk-border)] px-2.5 py-1 font-mono text-[11px] [color:var(--mk-text-muted)] [background:var(--mk-surface-2)]">
                        <Cpu size={11} className="brand-text" />
                        {layer.detail}
                      </div>
                    </div>
                  </div>
                </GlowCard>
              </motion.div>
            );
          })}
        </div>

        {/* Architecture summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8 flex items-center justify-center"
        >
          <div className="brand-border brand-soft rounded-xl border px-6 py-4 text-center">
            <p className="brand-text font-mono text-sm font-semibold">{t.costNote}</p>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}

function DreamCycleSection({ t }: { t: (typeof copy)["de"] }) {
  const reduce = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % t.cycleSteps.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [reduce, t.cycleSteps.length]);

  return (
    <Section tone="slate" className="px-6 py-24" aria-label="Dream Cycle">
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-3xl font-black [color:var(--mk-text)] md:text-5xl">
              {t.cycleTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.cycleSub}
          </motion.p>
        </div>

        <div className="relative">
          <div className="absolute top-1/2 left-0 hidden h-px w-full -translate-y-1/2 [background:var(--mk-border)] lg:block" />
          <div className="grid gap-6 lg:grid-cols-4">
            {t.cycleSteps.map((step, i) => {
              const Icon = step.icon;
              const isActive = i === activeStep;
              return (
                <motion.div
                  key={step.phase}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="relative"
                >
                  <GlowCard
                    className={`h-full rounded-xl border p-5 transition-colors ${
                      isActive
                        ? "brand-border brand-soft"
                        : "[border-color:var(--mk-border)] [background:var(--mk-surface)]"
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${accentTile("violet", "slate")}`}
                      >
                        <Icon size={18} />
                      </div>
                      <span className="font-mono text-[10px] tracking-wider [color:var(--mk-text-muted)]">
                        {String(i + 1).padStart(2, "0")} /{" "}
                        {String(t.cycleSteps.length).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="mb-1 text-sm font-bold [color:var(--mk-text)]">{step.label}</h3>
                    <p className="text-xs leading-relaxed [color:var(--mk-text-muted)]">
                      {step.desc}
                    </p>
                    {isActive && (
                      <motion.div
                        layoutId="cycle-active"
                        className="brand-bg absolute -top-1 right-5 left-5 h-0.5 rounded-full"
                        transition={{ duration: 0.3 }}
                      />
                    )}
                  </GlowCard>
                </motion.div>
              );
            })}
          </div>
        </div>

        <motion.div
          {...reveal}
          className="mt-12 flex items-center justify-center gap-3 text-sm [color:var(--mk-text-muted)]"
        >
          <RefreshCw size={16} className="brand-text" />
          <span>
            {copy.de === t
              ? "Vollautomatisch · Nächtlich · Überwacht"
              : "Fully automatic · Nightly · Monitored"}
          </span>
        </motion.div>
      </div>
    </Section>
  );
}

function CompareSection({ t }: { t: (typeof copy)["de"] }) {
  return (
    <Section tone="light" className="px-6 py-24" aria-label="Vergleich">
      <div className="mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-3xl font-black [color:var(--mk-text)] md:text-5xl">
              {t.compareTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.compareSub}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.6, ease: EASE.out }}
          className="overflow-hidden rounded-2xl border [border-color:var(--mk-border-strong)] shadow-xl"
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b [border-color:var(--mk-border)] [background:var(--mk-surface-2)]">
                <th className="px-5 py-4 font-semibold [color:var(--mk-text)]">
                  {copy.de === t ? "Eigenschaft" : "Feature"}
                </th>
                <th className="px-5 py-4 font-semibold [color:var(--mk-text-muted)]">
                  {copy.de === t ? "Andere Kanzlei-KI" : "Other legal AI"}
                </th>
                <th className="brand-text px-5 py-4 font-semibold">Subsumio SuperBrain</th>
              </tr>
            </thead>
            <tbody>
              {t.compareRows.map((row, i) => (
                <motion.tr
                  key={row.feature}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.35, delay: i * 0.05 }}
                  className="border-b [border-color:var(--mk-border)] [background:var(--mk-surface)] last:border-0"
                >
                  <td className="px-5 py-4 font-medium [color:var(--mk-text)]">{row.feature}</td>
                  <td className="px-5 py-4 [color:var(--mk-text-muted)]">
                    <div className="flex items-center gap-2">
                      <span className="text-rose-400">✕</span>
                      {row.others}
                    </div>
                  </td>
                  <td className="px-5 py-4 font-medium [color:var(--mk-text)]">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={15} className="brand-text shrink-0" />
                      {row.subsumio}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </Section>
  );
}

// ── FINE-TUNING / LEGAL ENGINE ──
function FineTuneSection({ t }: { t: (typeof copy)["de"] }) {
  return (
    <Section tone="slate" className="px-6 py-24" aria-label="Subsumio Legal Engine">
      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={{ duration: 0.4 }}
            className="brand-border brand-soft mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
          >
            <Cpu size={14} className="brand-text" />
            <span className="brand-text font-mono text-xs tracking-wider uppercase">
              {copy.de === t ? "Proprietärer Moat" : "Proprietary Moat"}
            </span>
          </motion.div>
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-3xl font-black [color:var(--mk-text)] md:text-5xl">
              {t.finetuneTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.finetuneSub}
          </motion.p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {t.finetunePoints.map((point, i) => (
            <motion.div
              key={point.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-mono text-xs tracking-wider [color:var(--mk-text-muted)] uppercase">
                    {point.label}
                  </span>
                  <span className="brand-text [font-family:var(--font-display)] text-xl font-black">
                    {point.value}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                  {point.desc}
                </p>
              </GlowCard>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8"
        >
          <div className="brand-border brand-soft rounded-2xl border p-6 text-center">
            <div className="mb-2 flex items-center justify-center gap-2">
              <TrendingUp size={18} className="brand-text" />
              <span className="brand-text font-mono text-xs tracking-wider uppercase">
                {copy.de === t ? "Prognose" : "Forecast"}
              </span>
            </div>
            <p className="text-sm leading-relaxed [color:var(--mk-text)] md:text-base">
              {t.finetuneResult}
            </p>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}

function PrivacySection({ t }: { t: (typeof copy)["de"] }) {
  return (
    <Section tone="light" className="px-6 py-24" aria-label="Privacy & DSGVO">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-3xl font-black [color:var(--mk-text)] md:text-5xl">
              {t.privacyTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.privacySub}
          </motion.p>
        </div>

        <StaggerContainer className="grid gap-6 md:grid-cols-2" stagger={0.1}>
          {t.privacyPoints.map((point) => {
            const Icon = point.icon;
            return (
              <StaggerItem key={point.title}>
                <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
                  <div className="brand-soft brand-border mb-4 flex h-12 w-12 items-center justify-center rounded-xl border">
                    <Icon size={22} className="brand-text" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold [color:var(--mk-text)]">{point.title}</h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {point.desc}
                  </p>
                </GlowCard>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </div>
    </Section>
  );
}

function UseCasesSection({ t, lang }: { t: (typeof copy)["de"]; lang: Lang }) {
  return (
    <Section
      tone="light"
      className="px-6 py-24"
      aria-label={lang === "en" ? "Use cases" : "Anwendungsfälle"}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-3xl font-black [color:var(--mk-text)] md:text-5xl">
              {t.useCasesTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.useCasesSub}
          </motion.p>
        </div>

        <StaggerContainer className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" stagger={0.08}>
          {t.useCases.map((uc) => {
            const Icon = uc.icon;
            return (
              <StaggerItem key={uc.title}>
                <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
                  <div className="brand-soft brand-border mb-4 flex h-11 w-11 items-center justify-center rounded-xl border">
                    <Icon size={20} className="brand-text" />
                  </div>
                  <h3 className="mb-2 text-base font-bold [color:var(--mk-text)]">{uc.title}</h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{uc.desc}</p>
                </GlowCard>
              </StaggerItem>
            );
          })}
        </StaggerContainer>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <Link
            href={p(lang, "/features")}
            className="brand-text inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            {lang === "en" ? "Explore all features" : "Alle Features ansehen"}
            <ArrowRight size={14} />
          </Link>
        </motion.div>
      </div>
    </Section>
  );
}

function TrustSection({ t, lang }: { t: (typeof copy)["de"]; lang: Lang }) {
  return (
    <Section
      tone="slate"
      className="px-6 py-24"
      aria-label={lang === "en" ? "Compliance & integrations" : "Compliance & Integrationen"}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-3xl font-black [color:var(--mk-text)] md:text-5xl">
              {t.trustTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.trustSub}
          </motion.p>
        </div>

        <div className="mb-16 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {t.trustBadges.map((badge, i) => (
            <motion.div
              key={badge.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-2xl border [border-color:var(--mk-border)] p-5 text-center [background:var(--mk-surface)]"
            >
              <div className="brand-text mb-2 [font-family:var(--font-display)] text-lg font-black">
                {badge.label}
              </div>
              <p className="text-xs leading-relaxed [color:var(--mk-text-muted)]">{badge.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <h3 className="mb-6 [font-family:var(--font-display)] text-xl font-bold [color:var(--mk-text)]">
            {t.integrationsTitle}
          </h3>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {t.integrations.map((integration, i) => (
              <motion.div
                key={integration.name}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="flex items-center gap-2 rounded-full border [border-color:var(--mk-border)] px-4 py-2 [background:var(--mk-surface)]"
              >
                <span className="text-sm font-semibold [color:var(--mk-text)]">
                  {integration.name}
                </span>
                <span className="text-xs [color:var(--mk-text-subtle)]">{integration.desc}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <Link
            href={p(lang, "/security")}
            className="brand-text inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            {lang === "en" ? "Read security details" : "Security-Details ansehen"}
            <ArrowRight size={14} />
          </Link>
        </motion.div>
      </div>
    </Section>
  );
}

function FAQSection({ t, lang }: { t: (typeof copy)["de"]; lang: Lang }) {
  const faqItems = t.faq.map((item) => ({ q: item.q, a: item.a }));
  return (
    <Section tone="light" className="px-6 py-24" aria-label="FAQ">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-3xl font-black [color:var(--mk-text)] md:text-5xl">
              {lang === "en" ? "Frequently asked questions" : "Häufig gestellte Fragen"}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-2xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {lang === "en"
              ? "Everything you need to know about the SuperBrain, the Dream Cycle and the 5-layer architecture."
              : "Alles, was du über das SuperBrain, den Dream Cycle und die 5-Ebenen-Architektur wissen musst."}
          </motion.p>
        </div>

        <AnimatedFaqList items={faqItems} tone="light" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <Link
            href={p(lang, "/pricing")}
            className="brand-text inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            {lang === "en" ? "See pricing plans" : "Preise ansehen"}
            <ArrowRight size={14} />
          </Link>
        </motion.div>
      </div>
    </Section>
  );
}

function StickyCTA({ t, lang }: { t: (typeof copy)["de"]; lang: Lang }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 800);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (useReducedMotion()) return null;
  return (
    <motion.div
      initial={false}
      animate={{ y: visible ? 0 : 100, opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.3, ease: EASE.out }}
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 px-4"
      aria-hidden={!visible}
    >
      <Link href={p(lang, "/signup")}>
        <div className="brand-border-strong brand-soft-strong flex items-center gap-3 rounded-full border px-5 py-3 shadow-2xl backdrop-blur-md">
          <span className="text-sm font-bold [color:var(--mk-text)]">{t.stickyCtaText}</span>
          <span className="hidden text-xs [color:var(--mk-text-muted)] sm:inline">
            {t.stickyCtaHint}
          </span>
          <ArrowRight size={16} className="brand-text" />
        </div>
      </Link>
    </motion.div>
  );
}

function CTASection({ t, lang }: { t: (typeof copy)["de"]; lang: Lang }) {
  return (
    <Section tone="slate" className="px-6 py-24" aria-label="Call to action">
      <div className="brand-glow-bg absolute inset-x-0 top-1/2 h-72 -translate-y-1/2 opacity-30 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, ease: EASE.dramatic }}
          className="mb-8 flex justify-center"
        >
          <div className="brand-soft-strong brand-border-strong flex h-20 w-20 items-center justify-center rounded-2xl border">
            <Brain size={36} className="brand-text" />
          </div>
        </motion.div>
        <ClipReveal>
          <h2 className="mb-5 [font-family:var(--font-display)] text-3xl font-black [color:var(--mk-text)] md:text-5xl">
            {t.ctaTitle}
          </h2>
        </ClipReveal>
        <motion.p
          {...reveal}
          className="mb-10 text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
        >
          {t.ctaSub}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.45, delay: 0.2 }}
        >
          <Link href={p(lang, "/signup")}>
            <Button size="lg" className="gap-2">
              {t.ctaButton} <ArrowRight size={18} />
            </Button>
          </Link>
        </motion.div>
      </div>
    </Section>
  );
}

export default function SuperbrainPage({ lang }: { lang: Lang }) {
  const t = getCopy(lang);

  return (
    <div
      data-tone="light"
      className="min-h-screen overflow-x-hidden [background:var(--mk-bg)]"
      lang={lang}
    >
      <HeroSection t={t} lang={lang} />
      <StatsBand t={t} />
      <OthersSection t={t} />
      <OursSection t={t} />
      <ArchitectureSection t={t} />
      <DreamCycleSection t={t} />
      <CompareSection t={t} />
      <FineTuneSection t={t} />
      <UseCasesSection t={t} lang={lang} />
      <PrivacySection t={t} />
      <TrustSection t={t} lang={lang} />
      <FAQSection t={t} lang={lang} />
      <CTASection t={t} lang={lang} />
      <StickyCTA t={t} lang={lang} />
    </div>
  );
}
