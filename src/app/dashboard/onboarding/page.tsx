"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Zap,
  Upload,
  MessageSquare,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Scale,
  Briefcase,
  FileText,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMe } from "@/lib/queries/auth";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";

type Step = "welcome" | "industry" | "upload" | "query" | "done";

const STEPS: Step[] = ["welcome", "industry", "upload", "query", "done"];
const STEP_INDEX: Record<Step, number> = { welcome: 0, industry: 1, upload: 2, query: 3, done: 4 };

export default function OnboardingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const meQuery = useMe();
  const { t } = useLang();
  const [step, setStep] = useState<Step>("welcome");
  const [industry, setIndustry] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [querying, setQuerying] = useState(false);
  const [queryAnswer, setQueryAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const currentIdx = STEP_INDEX[step];
  const totalSteps = STEPS.length - 1;

  const goTo = (s: Step) => {
    setError(null);
    setStep(s);
  };

  const next = useCallback(() => {
    const idx = STEP_INDEX[step];
    if (idx < STEPS.length - 1) goTo(STEPS[idx + 1]);
  }, [step]);

  const back = useCallback(() => {
    const idx = STEP_INDEX[step];
    if (idx > 0) goTo(STEPS[idx - 1]);
  }, [step]);

  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      try {
        await api.upload.file(file);
        setUploaded(true);
      } catch {
        setError(t("onboarding.error_upload"));
      }
      setUploading(false);
    },
    [t]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  const handleAsk = useCallback(async () => {
    if (!queryText.trim()) return;
    setQuerying(true);
    setError(null);
    setQueryAnswer(null);
    try {
      const result = await api.query.think(queryText.trim(), "balanced", (chunk) => {
        setQueryAnswer((prev) => (prev ?? "") + chunk);
      });
      if (!result.answer && !queryAnswer) {
        setQueryAnswer(result.answer || "—");
      }
    } catch {
      setError(t("onboarding.error_query"));
    }
    setQuerying(false);
  }, [queryText, t, queryAnswer]);

  const finish = useCallback(async () => {
    setCompleting(true);
    try {
      await csrfFetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry }),
      });
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      router.replace("/dashboard");
    } catch {
      setError("Onboarding konnte nicht abgeschlossen werden. Bitte erneut versuchen.");
    }
    setCompleting(false);
  }, [industry, qc, router]);

  const skipOnboarding = useCallback(async () => {
    setCompleting(true);
    try {
      await csrfFetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry: null }),
      });
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      router.replace("/dashboard");
    } catch {
      router.replace("/dashboard");
    }
    setCompleting(false);
  }, [qc, router]);

  const userName = meQuery.data?.user?.name ?? "";

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4 md:p-8"
      style={{
        background:
          "linear-gradient(135deg, var(--brand-gradient-from, #14b8a6) 0%, var(--brand-gradient-via, #1d4ed8) 50%, var(--brand-gradient-to, #0f172a) 100%)",
      }}
    >
      <div className="w-full max-w-2xl">
        {/* Progress bar */}
        <div className="mb-6 flex items-center gap-2">
          {STEPS.slice(0, -1).map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i <= currentIdx ? "bg-white" : "bg-white/20"
              }`}
              style={{ flex: 1 }}
            />
          ))}
        </div>

        <Card className="overflow-hidden">
          <div className="p-6 md:p-10">
            {/* Step counter */}
            <div className="mb-6 flex items-center justify-between">
              <span className="text-xs font-medium tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                {t("onboarding.step")} {Math.min(currentIdx + 1, totalSteps + 1)}{" "}
                {t("onboarding.of")} {totalSteps + 1}
              </span>
              {step !== "done" && (
                <button
                  onClick={skipOnboarding}
                  disabled={completing}
                  className="text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
                >
                  {t("onboarding.skip")}
                </button>
              )}
            </div>

            {/* Welcome */}
            {step === "welcome" && (
              <div className="space-y-4 text-center">
                <div className="brand-soft brand-border mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border">
                  <Zap size={28} className="brand-text" />
                </div>
                <h1 className="text-2xl font-bold text-[color:var(--ds-text)]">
                  {t("onboarding.title")}
                </h1>
                <p className="mx-auto max-w-md text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
                  {userName ? `${userName}, ` : ""}
                  {t("onboarding.step_welcome_desc")}
                </p>
                <div className="pt-4">
                  <Button variant="glow" size="md" onClick={next}>
                    {t("onboarding.next")} <ArrowRight size={14} />
                  </Button>
                </div>
              </div>
            )}

            {/* Industry */}
            {step === "industry" && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="brand-soft brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
                    <Briefcase size={18} className="brand-text" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[color:var(--ds-text)]">
                      {t("onboarding.step_industry")}
                    </h2>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("onboarding.step_industry_desc")}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3">
                  <button
                    onClick={() => setIndustry("legal")}
                    className={`flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                      industry === "legal"
                        ? "brand-border bg-[color:var(--brand-primary)]/5"
                        : "border-[color:var(--ds-border)] hover:border-[color:var(--brand-primary)]/30"
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                      <Scale size={18} className="text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[color:var(--ds-text)]">
                        {t("onboarding.industry_legal")}
                      </p>
                      <p className="text-xs text-[color:var(--ds-text-muted)]">
                        Fristen, RVG, beA, Akten-Graph
                      </p>
                    </div>
                    {industry === "legal" && <CheckCircle2 size={18} className="brand-text" />}
                  </button>
                  <button
                    onClick={() => setIndustry("other")}
                    className={`flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                      industry === "other"
                        ? "brand-border bg-[color:var(--brand-primary)]/5"
                        : "border-[color:var(--ds-border)] hover:border-[color:var(--brand-primary)]/30"
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-500/10">
                      <Briefcase size={18} className="text-slate-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[color:var(--ds-text)]">
                        {t("onboarding.industry_other")}
                      </p>
                      <p className="text-xs text-[color:var(--ds-text-muted)]">
                        Generisches Brain ohne Branchen-Schema
                      </p>
                    </div>
                    {industry === "other" && <CheckCircle2 size={18} className="brand-text" />}
                  </button>
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" size="sm" onClick={back}>
                    <ArrowLeft size={14} /> {t("onboarding.back")}
                  </Button>
                  <Button variant="glow" size="sm" onClick={next} disabled={!industry}>
                    {t("onboarding.next")} <ArrowRight size={14} />
                  </Button>
                </div>
              </div>
            )}

            {/* Upload */}
            {step === "upload" && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="brand-soft brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
                    <Upload size={18} className="brand-text" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[color:var(--ds-text)]">
                      {t("onboarding.step_upload")}
                    </h2>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("onboarding.step_upload_desc")}
                    </p>
                  </div>
                </div>

                {uploaded ? (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                      <CheckCircle2 size={28} className="text-emerald-600" />
                    </div>
                    <p className="text-sm font-medium text-emerald-700">
                      {t("onboarding.step_upload_success")}
                    </p>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all ${
                      dragOver
                        ? "brand-border bg-[color:var(--brand-primary)]/5"
                        : "border-[color:var(--ds-border)] hover:border-[color:var(--brand-primary)]/30"
                    }`}
                  >
                    {uploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 size={24} className="brand-text animate-spin" />
                        <p className="text-xs text-[color:var(--ds-text-muted)]">
                          Wird hochgeladen…
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <FileText size={28} className="text-[color:var(--ds-text-muted)]" />
                        <p className="text-sm text-[color:var(--ds-text)]">
                          {t("onboarding.step_upload_drop")}
                        </p>
                        <p className="text-xs text-[color:var(--ds-text-muted)]">
                          {t("onboarding.step_upload_hint")}
                        </p>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.docx,.md,.txt"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleFile(file);
                      }}
                    />
                  </div>
                )}

                {error && <p className="text-xs text-red-600">{error}</p>}

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" size="sm" onClick={back}>
                    <ArrowLeft size={14} /> {t("onboarding.back")}
                  </Button>
                  <Button variant="glow" size="sm" onClick={next}>
                    {uploaded ? t("onboarding.next") : t("onboarding.skip")}{" "}
                    <ArrowRight size={14} />
                  </Button>
                </div>
              </div>
            )}

            {/* Query */}
            {step === "query" && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="brand-soft brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
                    <MessageSquare size={18} className="brand-text" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[color:var(--ds-text)]">
                      {t("onboarding.step_query")}
                    </h2>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("onboarding.step_query_desc")}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <textarea
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    placeholder={t("onboarding.step_query_placeholder")}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:ring-2 focus:ring-[color:var(--brand-primary)]/30 focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void handleAsk();
                      }
                    }}
                  />
                  <Button
                    variant="glow"
                    size="sm"
                    onClick={handleAsk}
                    disabled={!queryText.trim() || querying}
                    loading={querying}
                  >
                    <MessageSquare size={14} /> {t("onboarding.step_query_ask")}
                  </Button>
                </div>

                {querying && !queryAnswer && (
                  <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                    <Loader2 size={14} className="animate-spin" />
                    {t("onboarding.step_query_thinking")}
                  </div>
                )}

                {queryAnswer && (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                    <p className="text-xs leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
                      {queryAnswer}
                    </p>
                  </div>
                )}

                {error && <p className="text-xs text-red-600">{error}</p>}

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" size="sm" onClick={back}>
                    <ArrowLeft size={14} /> {t("onboarding.back")}
                  </Button>
                  <Button variant="glow" size="sm" onClick={next}>
                    {t("onboarding.next")} <ArrowRight size={14} />
                  </Button>
                </div>
              </div>
            )}

            {/* Done */}
            {step === "done" && (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
                  <Sparkles size={28} className="text-emerald-600" />
                </div>
                <h1 className="text-2xl font-bold text-[color:var(--ds-text)]">
                  {t("onboarding.step_done")}
                </h1>
                <p className="mx-auto max-w-md text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
                  {t("onboarding.step_done_desc")}
                </p>
                <div className="pt-4">
                  <Button variant="glow" size="md" onClick={finish} loading={completing}>
                    {t("onboarding.finish")} <ArrowRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
