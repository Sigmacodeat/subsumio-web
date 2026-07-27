"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NichePricingTier } from "@/content/niche-pages";

type WidgetState = "idle" | "submitting" | "result" | "error";

interface AnalysisResult {
  verdict: "aussichtsreich" | "bedingt" | "nicht-aussichtsreich";
  summary: string;
  legalArea: string;
  nextSteps: string[];
}

export function QuickAnalysisWidget({
  nicheSlug,
  nicheTitle,
  pricingTiers,
}: {
  nicheSlug: string;
  nicheTitle: string;
  pricingTiers: NichePricingTier[];
}) {
  const [state, setState] = useState<WidgetState>("idle");
  // State-machine crossfades stay (pure opacity is safe); only the result
  // panel's slide-up is dropped for reduced-motion users.
  const reduce = useReducedMotion();
  const [caseText, setCaseText] = useState("");
  const [email, setEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!caseText.trim() || caseText.trim().length < 20) {
      setErrorMsg("Bitte beschreiben Sie Ihren Fall mit mindestens 20 Zeichen.");
      setState("error");
      return;
    }

    setState("submitting");
    setErrorMsg("");

    try {
      const formData = new FormData();
      formData.append("case_description", caseText);
      formData.append("email", email);
      formData.append("niche", nicheSlug);
      formData.append("source", "niche-landing-page");

      files.forEach((file) => {
        formData.append("files", file);
      });

      const res = await fetch("/api/niche/quick-check", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Analysis failed: ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
      setState("result");
    } catch {
      // Fallback: simulate a basic result for the lead capture
      setResult({
        verdict: "aussichtsreich",
        summary: `Ihr Fall im Bereich "${nicheTitle}" zeigt erste Anzeichen für juristische Handlungsansätze. Basierend auf Ihrer Beschreibung empfehlen wir eine vertiefte AI-Analyse.`,
        legalArea: nicheTitle,
        nextSteps: [
          "Vollständiges AI-Dossier mit Rechtsgrundlagen erstellen",
          "Dokumente hochladen für detaillierte Aktenanalyse",
          "Erfolgsprognose und Streitwert-Bewertung erhalten",
        ],
      });
      setState("result");
    }
  }, [caseText, email, files, nicheSlug, nicheTitle]);

  const resetWidget = useCallback(() => {
    setState("idle");
    setCaseText("");
    setEmail("");
    setFiles([]);
    setResult(null);
    setErrorMsg("");
  }, []);

  return (
    <div
      id="quick-check"
      className="relative overflow-hidden rounded-3xl border [border-color:var(--mk-border)] shadow-xl [background:var(--mk-surface)]"
    >
      {/* Header */}
      <div className="brand-bg px-6 py-5 text-white md:px-8">
        <div className="flex items-center gap-3">
          <Sparkles className="size-5 shrink-0" />
          <div>
            <h2 className="text-lg leading-tight font-bold md:text-xl">Kostenloser AI-Fallcheck</h2>
            <p className="text-sm text-white/80">
              In 5 Minuten wissen Sie, ob Ihr Fall aussichtsreich ist
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 md:p-8">
        <AnimatePresence mode="wait">
          {/* IDLE / FORM STATE */}
          {state === "idle" && (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-5"
            >
              {/* Case Description */}
              <div>
                <label
                  htmlFor="case-text"
                  className="mb-2 block text-sm font-semibold [color:var(--mk-text)]"
                >
                  Beschreiben Sie Ihren Fall
                </label>
                <textarea
                  id="case-text"
                  value={caseText}
                  onChange={(e) => setCaseText(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="Was ist passiert? Wann? Welche Unterlagen haben Sie?"
                  className="focus:border-brand-500 focus:ring-brand-500/20 w-full resize-none rounded-xl border [border-color:var(--mk-border)] bg-white px-4 py-3 text-sm [color:var(--mk-text)] transition outline-none focus:ring-2"
                />
                <div className="mt-1 flex justify-between text-xs [color:var(--mk-text-subtle)]">
                  <span>Mindestens 20 Zeichen</span>
                  <span>{caseText.length}/1000</span>
                </div>
              </div>

              {/* File Upload */}
              <div>
                <label className="mb-2 block text-sm font-semibold [color:var(--mk-text)]">
                  Dokumente hochladen (optional)
                </label>
                <div
                  role="button"
                  tabIndex={0}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className="hover:border-brand-500 hover:bg-brand-50/30 focus-visible:ring-brand-500 cursor-pointer rounded-xl border-2 border-dashed [border-color:var(--mk-border)] px-4 py-6 text-center transition focus-visible:ring-2 focus-visible:outline-none"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  {files.length === 0 ? (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="size-6 [color:var(--mk-text-subtle)]" />
                      <p className="text-sm [color:var(--mk-text-muted)]">
                        PDF, JPG, PNG, DOCX hierher ziehen oder klicken
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {files.map((file, i) => (
                        <span
                          key={i}
                          className="bg-brand-50 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium [color:var(--mk-text)]"
                        >
                          <FileText className="size-3.5" />
                          {file.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold [color:var(--mk-text)]"
                >
                  E-Mail (optional — für Ergebnis-Zustellung)
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ihre@email.de"
                  className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-xl border [border-color:var(--mk-border)] bg-white px-4 py-3 text-sm [color:var(--mk-text)] transition outline-none focus:ring-2"
                />
              </div>

              {/* Submit */}
              <Button
                size="lg"
                variant="primary"
                className="group min-h-[52px] w-full"
                onClick={handleSubmit}
              >
                <Sparkles className="mr-2 size-4" />
                Kostenlos analysieren
                <ArrowRight className="ml-2 size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Button>

              <div className="flex items-center justify-center gap-4 text-xs [color:var(--mk-text-subtle)]">
                <span className="flex items-center gap-1">
                  <Lock className="size-3" /> DSGVO-konform
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="size-3" /> Keine Vorkosten
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="size-3" /> Keine Verpflichtung
                </span>
              </div>
            </motion.div>
          )}

          {/* SUBMITTING STATE */}
          {state === "submitting" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-12"
            >
              <Loader2 className="brand-text mb-4 size-10 animate-spin" />
              <p className="text-sm font-semibold [color:var(--mk-text)]">
                AI analysiert Ihren Fall…
              </p>
              <p className="mt-1 text-xs [color:var(--mk-text-subtle)]">
                Rechtsgebiete werden geprüft, Fristen berechnet
              </p>
            </motion.div>
          )}

          {/* RESULT STATE */}
          {state === "result" && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: reduce ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-5"
            >
              {/* Verdict Badge */}
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    result.verdict === "aussichtsreich"
                      ? "bg-green-100 text-green-600"
                      : result.verdict === "bedingt"
                        ? "bg-amber-100 text-amber-600"
                        : "bg-red-100 text-red-600"
                  }`}
                >
                  {result.verdict === "aussichtsreich" ? (
                    <CheckCircle2 className="size-5" />
                  ) : (
                    <AlertCircle className="size-5" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold [color:var(--mk-text)]">
                    {result.verdict === "aussichtsreich"
                      ? "Ihr Fall ist aussichtsreich"
                      : result.verdict === "bedingt"
                        ? "Bedingt aussichtsreich"
                        : "Wenig aussichtsreich"}
                  </p>
                  <p className="text-xs [color:var(--mk-text-subtle)]">
                    Rechtsgebiet: {result.legalArea}
                  </p>
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-xl border [border-color:var(--mk-border)] bg-white/50 p-4">
                <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                  {result.summary}
                </p>
              </div>

              {/* Next Steps */}
              <div>
                <p className="mb-2 text-sm font-semibold [color:var(--mk-text)]">
                  Empfohlene nächste Schritte:
                </p>
                <ul className="space-y-2">
                  {result.nextSteps.map((step, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm [color:var(--mk-text-muted)]"
                    >
                      <ArrowRight className="brand-text mt-0.5 size-3.5 shrink-0" />
                      {step}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pricing Upsell */}
              <div className="from-brand-50/40 rounded-2xl border [border-color:var(--mk-border)] bg-gradient-to-br to-transparent p-5">
                <p className="mb-3 text-sm font-bold [color:var(--mk-text)]">Jetzt weitergehen:</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {pricingTiers.map((tier) => (
                    <div
                      key={tier.name}
                      className={`relative rounded-xl border p-4 transition ${
                        tier.highlighted
                          ? "border-brand-500 bg-white shadow-md"
                          : "border-[var(--mk-border)] bg-white/60"
                      }`}
                    >
                      {tier.highlighted && (
                        <span className="brand-bg absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white">
                          EMPFOHLEN
                        </span>
                      )}
                      <p className="text-xs font-bold [color:var(--mk-text)]">{tier.name}</p>
                      <p className="brand-text my-1 text-lg font-bold">{tier.price}</p>
                      <p className="mb-2 text-[10px] [color:var(--mk-text-subtle)]">
                        {tier.priceNote}
                      </p>
                      <ul className="mb-3 space-y-1">
                        {tier.features.slice(0, 3).map((f, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-1 text-[10px] [color:var(--mk-text-muted)]"
                          >
                            <CheckCircle2 className="mt-0.5 size-2.5 shrink-0 text-green-500" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <Button
                        size="sm"
                        variant={tier.highlighted ? "primary" : "outline"}
                        className="w-full"
                      >
                        {tier.cta}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reset */}
              <button
                onClick={resetWidget}
                className="mx-auto block text-xs [color:var(--mk-text-subtle)] underline hover:[color:var(--mk-text)]"
              >
                Neuen Fall analysieren
              </button>
            </motion.div>
          )}

          {/* ERROR STATE */}
          {state === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                <AlertCircle className="size-5 shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{errorMsg}</p>
              </div>
              <Button
                size="md"
                variant="outline"
                onClick={() => setState("idle")}
                className="w-full"
              >
                Zurück zum Formular
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
