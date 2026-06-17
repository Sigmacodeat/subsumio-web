"use client";

// "Sigmabrain in action" — a scripted, looping mockup of the dashboard with an
// animated cursor that attaches a file, types a question and receives a cited
// answer. The premium "product reel" technique (Linear/Arc style) done in pure
// React/framer-motion — no video, themeable via --brand-*. Reduced-motion shows
// the final answered state without the loop. Each vertical gets its own scripted
// example (file, question, cited answer, sidebar) so a branch page tells its own
// story instead of a generic one.

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Paperclip, Send, FileText, Sparkles, MousePointer2 } from "lucide-react";
import type { Lang } from "@/content/site";
import { profileForIndustry } from "@/lib/industry-pack";

interface Reel {
  question: string;
  file: string;
  answer: string;
  sources: string[];
}

interface Branch {
  sidebar: Record<Lang, string[]>;
  reel: Record<Lang, Reel>;
}

const BRANCHES: Record<string, Branch> = {
  legal: {
    sidebar: {
      de: ["Brain fragen", "Akten", "Fristen", "Schriftsätze", "Konnektoren"],
      en: ["Ask brain", "Matters", "Deadlines", "Filings", "Connectors"],
    },
    reel: {
      de: {
        question: "Was ist in dieser Akte noch offen — mit Fundstellen?",
        file: "Akte_Beispiel-GmbH.pdf",
        answer: "3 offene Punkte: Frist Klageerwiderung (12.07.), fehlende Vollmacht, Zeugenliste unvollständig.",
        sources: ["akten/beispiel-gmbh", "fristen/2026-07", "schriftsatz/klageerwiderung"],
      },
      en: {
        question: "What's still open in this matter — with sources?",
        file: "Matter_Example-Ltd.pdf",
        answer: "3 open items: defense-filing deadline (Jul 12), missing power of attorney, witness list incomplete.",
        sources: ["matters/example-ltd", "deadlines/2026-07", "filing/defense"],
      },
    },
  },
  tax: {
    sidebar: {
      de: ["Brain fragen", "Belege", "Buchungen", "Mandanten", "Konnektoren"],
      en: ["Ask brain", "Receipts", "Bookings", "Clients", "Connectors"],
    },
    reel: {
      de: {
        question: "Welche Belege sind ohne Vorsteuerabzug verbucht?",
        file: "DATEV_Export_Q2.csv",
        answer: "4 Belege ohne Vorsteuer: 2× fehlende Rechnungsnummer, 1× Kleinbetrag korrekt, 1× Bewirtung prüfen (§ 15 UStG).",
        sources: ["belege/2026-q2", "ustg/§15", "mandant/beispiel-gmbh"],
      },
      en: {
        question: "Which receipts are booked without input-VAT deduction?",
        file: "DATEV_Export_Q2.csv",
        answer: "4 receipts without input VAT: 2× missing invoice number, 1× small-amount fine, 1× entertainment to review (§ 15 VAT Act).",
        sources: ["receipts/2026-q2", "vat-act/§15", "client/example-ltd"],
      },
    },
  },
  compliance: {
    sidebar: {
      de: ["Brain fragen", "Richtlinien", "Kontrollen", "Register", "Konnektoren"],
      en: ["Ask brain", "Policies", "Controls", "Registers", "Connectors"],
    },
    reel: {
      de: {
        question: "Welche KI-Systeme fallen unter Hochrisiko nach EU AI Act?",
        file: "KI-System_Inventar.xlsx",
        answer: "2 Hochrisiko-Systeme (Anhang III): Bewerber-Scoring, Kreditentscheidung. Konformitätsbewertung fehlt bei beiden.",
        sources: ["inventar/ki-systeme", "eu-ai-act/anhang-iii", "kontrollen/offen"],
      },
      en: {
        question: "Which AI systems are high-risk under the EU AI Act?",
        file: "AI-System_Inventory.xlsx",
        answer: "2 high-risk systems (Annex III): applicant scoring, credit decisioning. Conformity assessment missing for both.",
        sources: ["inventory/ai-systems", "eu-ai-act/annex-iii", "controls/open"],
      },
    },
  },
  insurance: {
    sidebar: {
      de: ["Brain fragen", "Schäden", "Policen", "Deckung", "Konnektoren"],
      en: ["Ask brain", "Claims", "Policies", "Coverage", "Connectors"],
    },
    reel: {
      de: {
        question: "Gibt es eine Deckungslücke in diesem Schadenfall?",
        file: "Schadenakte_2026-0481.pdf",
        answer: "Ja: Elementarschaden nicht eingeschlossen, Selbstbehalt 1.500 €, Meldefrist knapp eingehalten.",
        sources: ["schaden/2026-0481", "police/wohngebaeude", "bedingungen/§7"],
      },
      en: {
        question: "Is there a coverage gap in this claim?",
        file: "Claim_2026-0481.pdf",
        answer: "Yes: natural-hazard cover excluded, €1,500 deductible, notification duty met just in time.",
        sources: ["claim/2026-0481", "policy/building", "terms/§7"],
      },
    },
  },
  realestate: {
    sidebar: {
      de: ["Brain fragen", "Objekte", "Mietverträge", "Due Diligence", "Konnektoren"],
      en: ["Ask brain", "Assets", "Leases", "Due diligence", "Connectors"],
    },
    reel: {
      de: {
        question: "Welche Klauseln in diesem Mietvertrag sind risikobehaftet?",
        file: "Mietvertrag_Objekt-Nord.pdf",
        answer: "3 Risiken: Indexmiete ohne Kappung, Schönheitsreparaturen unwirksam, Kündigungsfrist abweichend.",
        sources: ["objekt/nord", "mietvertrag/§4", "rechtsprechung/bgh"],
      },
      en: {
        question: "Which clauses in this lease are risky?",
        file: "Lease_Asset-North.pdf",
        answer: "3 risks: index rent without cap, redecoration clause void, non-standard notice period.",
        sources: ["asset/north", "lease/§4", "case-law"],
      },
    },
  },
  vc: {
    sidebar: {
      de: ["Brain fragen", "Deals", "Portfolio", "Pipeline", "Konnektoren"],
      en: ["Ask brain", "Deals", "Portfolio", "Pipeline", "Connectors"],
    },
    reel: {
      de: {
        question: "Fasse dieses Deck als Deal-Memo zusammen — mit roten Flaggen.",
        file: "Pitch_Deck_acme-seed.pdf",
        answer: "Markt groß, Team stark. Rote Flaggen: CAC steigend, kein Lock-in, Runway < 9 Monate.",
        sources: ["deals/acme-seed", "metriken/cac", "portfolio/benchmarks"],
      },
      en: {
        question: "Summarize this deck as a deal memo — with red flags.",
        file: "Pitch_Deck_acme-seed.pdf",
        answer: "Big market, strong team. Red flags: rising CAC, no lock-in, runway < 9 months.",
        sources: ["deals/acme-seed", "metrics/cac", "portfolio/benchmarks"],
      },
    },
  },
  consulting: {
    sidebar: {
      de: ["Brain fragen", "Projekte", "Angebote", "Wissen", "Konnektoren"],
      en: ["Ask brain", "Projects", "Proposals", "Knowledge", "Connectors"],
    },
    reel: {
      de: {
        question: "Welche unserer Referenzen passen auf diese Ausschreibung?",
        file: "RFP_Kunde-Beispiel.pdf",
        answer: "3 passende Projekte: 2× gleiche Branche, 1× gleicher Tech-Stack. Lücke: ISO-27001-Zertifizierung fehlt.",
        sources: ["projekte/referenzen", "angebot/rfp", "skills/matrix"],
      },
      en: {
        question: "Which of our references fit this RFP?",
        file: "RFP_Client-Example.pdf",
        answer: "3 matching projects: 2× same industry, 1× same tech stack. Gap: ISO 27001 certification missing.",
        sources: ["projects/references", "proposal/rfp", "skills/matrix"],
      },
    },
  },
  recruiting: {
    sidebar: {
      de: ["Brain fragen", "Kandidaten", "Stellen", "Pipeline", "Konnektoren"],
      en: ["Ask brain", "Candidates", "Roles", "Pipeline", "Connectors"],
    },
    reel: {
      de: {
        question: "Wie gut passt dieser Kandidat auf die Senior-Rolle?",
        file: "Lebenslauf_Kandidat-A.pdf",
        answer: "Match 86 %: Stack passt, 7 Jahre Erfahrung. Lücken: keine Führungserfahrung, Gehaltsband am oberen Rand.",
        sources: ["kandidaten/kandidat-a", "stelle/senior", "pipeline/aktiv"],
      },
      en: {
        question: "How well does this candidate fit the senior role?",
        file: "Resume_Candidate-A.pdf",
        answer: "86% match: stack fits, 7 years' experience. Gaps: no leadership experience, salary at top of band.",
        sources: ["candidates/candidate-a", "role/senior", "pipeline/active"],
      },
    },
  },
  medical: {
    sidebar: {
      de: ["Brain fragen", "Befunde", "Behandlungen", "Wiedervorlage", "Konnektoren"],
      en: ["Ask brain", "Findings", "Treatments", "Follow-ups", "Connectors"],
    },
    reel: {
      de: {
        question: "Was ist bei diesem Patienten zur Wiedervorlage offen?",
        file: "Befund_Patient-Muster.pdf",
        answer: "3 Punkte: Laborkontrolle in 4 Wochen, Radiologie-Befund ausstehend, Folgerezept fällig.",
        sources: ["befunde/patient-muster", "labor/2026-07", "wiedervorlage/offen"],
      },
      en: {
        question: "What's open for follow-up for this patient?",
        file: "Findings_Patient-Sample.pdf",
        answer: "3 items: lab check in 4 weeks, radiology report pending, repeat prescription due.",
        sources: ["findings/patient-sample", "lab/2026-07", "follow-ups/open"],
      },
    },
  },
};

// Scripted timeline. cursor = % position within the reel; each step dwells.
const STEPS = [
  { dwell: 900, cx: 50, cy: 50 },   // 0 idle, center
  { dwell: 650, cx: 9, cy: 90 },    // 1 → attach button
  { dwell: 500, cx: 9, cy: 90 },    // 2 click attach (file attaches)
  { dwell: 1800, cx: 45, cy: 90 },  // 3 → input, typing
  { dwell: 450, cx: 94, cy: 90 },   // 4 → send
  { dwell: 400, cx: 94, cy: 90 },   // 5 click send (user msg)
  { dwell: 1100, cx: 70, cy: 45 },  // 6 thinking
  { dwell: 2800, cx: 70, cy: 45 },  // 7 answer
  { dwell: 1500, cx: 70, cy: 45 },  // 8 hold
] as const;

export default function DashboardReel({
  lang,
  industry = "legal",
  className = "",
}: {
  lang: Lang;
  industry?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const branch = BRANCHES[industry] ?? BRANCHES.legal;
  const r = branch.reel[lang];
  const sidebar = branch.sidebar[lang];
  const brand = (profileForIndustry(industry)?.brand ?? "Sigmabrain").toLowerCase();
  const [phase, setPhase] = useState(reduce ? 7 : 0);
  const [typed, setTyped] = useState(reduce ? r.question : "");

  // advance the timeline (loops); static at "answer" under reduced-motion
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setPhase((p) => (p + 1) % STEPS.length), STEPS[phase].dwell);
    return () => clearTimeout(t);
  }, [phase, reduce]);

  // typewriter during the typing phase (3)
  useEffect(() => {
    if (reduce) return;
    if (phase < 3) { setTyped(""); return; }
    if (phase > 3) { setTyped(r.question); return; }
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setTyped(r.question.slice(0, i));
      if (i >= r.question.length) clearInterval(iv);
    }, 45);
    return () => clearInterval(iv);
  }, [phase, reduce, r.question]);

  const fileAttached = phase >= 2;
  const userSent = phase >= 5;
  const thinking = phase === 6;
  const answered = phase >= 7;
  const step = STEPS[phase];

  return (
    <div className={`relative rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-bg)] shadow-2xl shadow-black/60 overflow-hidden ${className}`}>
      {/* window bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b [border-color:var(--mk-border)] [background:var(--mk-surface)]">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
        <div className="flex-1 ml-3 text-xs [color:var(--mk-text-subtle)] font-mono">{brand} — dashboard</div>
        <span className="text-[10px] brand-text font-medium">live</span>
      </div>

      <div className="grid grid-cols-[120px_1fr] h-[330px]">
        {/* mini sidebar */}
        <div className="border-r [border-color:var(--mk-border)] [background:var(--mk-surface-2)] p-3 hidden sm:flex flex-col gap-1.5">
          {sidebar.map((t, i) => (
            <div key={t} className={`text-[11px] px-2 py-1.5 rounded-md ${i === 0 ? "brand-soft brand-text" : "[color:var(--mk-text-muted)]"}`}>{t}</div>
          ))}
        </div>

        {/* chat panel */}
        <div className="relative flex flex-col p-4 overflow-hidden">
          <div className="flex-1 space-y-3 overflow-hidden">
            {userSent && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                <div className="max-w-[80%] rounded-xl rounded-tr-sm [background:var(--mk-surface)] border [border-color:var(--mk-border)] px-3 py-2">
                  <p className="text-xs [color:var(--mk-text)]">{r.question}</p>
                  <span className="mt-1 inline-flex items-center gap-1 text-[10px] brand-text">
                    <FileText size={10} /> {r.file}
                  </span>
                </div>
              </motion.div>
            )}
            {thinking && (
              <div className="flex items-center gap-1.5 [color:var(--mk-text-muted)] text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-secondary)] animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-secondary)] animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-secondary)] animate-bounce [animation-delay:0.3s]" />
              </div>
            )}
            {answered && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2">
                <div className="w-6 h-6 rounded-md brand-soft border brand-border flex items-center justify-center shrink-0">
                  <Sparkles size={12} className="brand-text" />
                </div>
                <div className="max-w-[85%]">
                  <p className="text-xs [color:var(--mk-text-muted)] leading-relaxed">{r.answer}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.sources.map((s) => (
                      <span key={s} className="text-[9px] font-mono brand-text brand-soft px-1.5 py-0.5 rounded">{s}</span>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* input bar */}
          <div className="mt-3 flex items-center gap-2 rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface-2)] px-2 py-2">
            <div className={`flex items-center gap-1 rounded-lg px-1.5 py-1 ${fileAttached ? "brand-soft" : ""}`}>
              <Paperclip size={14} className={fileAttached ? "brand-text" : "[color:var(--mk-text-subtle)]"} />
            </div>
            <div className="flex-1 text-xs [color:var(--mk-text)] min-h-[16px]">
              {fileAttached && !userSent && (
                <span className="mr-1 inline-flex items-center gap-1 text-[10px] brand-text align-middle">
                  <FileText size={10} /> {r.file}
                </span>
              )}
              <span>{userSent ? "" : typed}</span>
              {!userSent && phase === 3 && <span className="inline-block w-0.5 h-3 bg-[var(--brand-secondary)] align-middle ml-0.5 animate-pulse" />}
            </div>
            <div className="rounded-lg brand-bg p-1.5"><Send size={13} className="text-white" /></div>
          </div>

          {/* animated cursor */}
          {!reduce && (
            <motion.div
              className="absolute z-20"
              animate={{ left: `${step.cx}%`, top: `${step.cy}%` }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            >
              <motion.div
                animate={{ scale: phase === 2 || phase === 5 ? [1, 0.8, 1] : 1 }}
                transition={{ duration: 0.3 }}
              >
                <MousePointer2 size={18} className="text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] fill-white/20" />
              </motion.div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
