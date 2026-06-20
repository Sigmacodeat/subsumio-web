"use client";

// "Subsumio in action" — a scripted, looping mockup of the dashboard with an
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
  const brand = (profileForIndustry(industry)?.brand ?? "Subsumio").toLowerCase();
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
    <div className={`relative rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-bg)] shadow-2xl shadow-black/20 overflow-hidden ${className}`}>
      {/* window bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b [border-color:var(--mk-border)] [background:var(--mk-surface)]">
        <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
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
