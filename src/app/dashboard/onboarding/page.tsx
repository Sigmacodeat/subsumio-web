"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Landmark,
  Upload,
  MessageSquare,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Scale,
  FileText,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMe } from "@/lib/queries/auth";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import {
  MAX_HOURLY_RATE_EUR,
  normalizeKanzleiSettings,
  saveKanzleiSettings,
} from "@/lib/kanzlei-settings";
import { UPLOAD_ACCEPT_ATTRIBUTE } from "@/lib/upload-formats";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";

type Step = "welcome" | "profile" | "billing" | "upload" | "query" | "done";

const STEPS: Step[] = ["welcome", "profile", "billing", "upload", "query", "done"];
const STEP_INDEX: Record<Step, number> = {
  welcome: 0,
  profile: 1,
  billing: 2,
  upload: 3,
  query: 4,
  done: 5,
};

export default function OnboardingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const meQuery = useMe();
  const { t } = useLang();
  const [step, setStep] = useState<Step>("welcome");
  const industry = "legal";
  const [profile, setProfile] = useState({
    kanzleiName: "",
    anwaltName: "",
    kanzleiEmail: "",
    country: "AT",
    role: "lawyer",
    focus: "",
  });
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [querying, setQuerying] = useState(false);
  const [queryAnswer, setQueryAnswer] = useState<string | null>(null);
  const {
    grounding: queryGrounding,
    groundAnswer: groundQuery,
    reset: resetQueryGrounding,
  } = useGroundedAnswer();
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [billing, setBilling] = useState({
    stundensatz: "220",
    abrechnungstakt: "15",
    iban: "",
    bankName: "",
  });

  const currentIdx = STEP_INDEX[step];
  const totalSteps = STEPS.length - 1;
  const userName = meQuery.data?.user?.name ?? "";
  const userEmail = meQuery.data?.user?.email ?? "";

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
        await api.upload.file(file, { source: "wiki" });
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
    resetQueryGrounding();
    let streamed = "";
    try {
      const result = await api.query.think(queryText.trim(), {
        mode: "balanced",
        queryMode: "balanced",
        onChunk: (chunk) => {
          streamed += chunk;
          setQueryAnswer((prev) => (prev ?? "") + chunk);
        },
      });
      const finalText = result.answer || streamed;
      if (!finalText) {
        setError("Der Assistent hat keine Antwort geliefert. Bitte formulieren Sie die Frage neu.");
      } else if (!streamed) {
        setQueryAnswer(finalText);
      }
      if (finalText) groundQuery(finalText).catch(() => {});
      if (finalText) api.onboarding.updateProgress({ firstQuery: true }).catch(() => {});
    } catch {
      setError(t("onboarding.error_query"));
    }
    setQuerying(false);
  }, [queryText, t, groundQuery, resetQueryGrounding]);

  const saveProfile = useCallback(async () => {
    const contactName = profile.anwaltName.trim() || userName.trim();
    const contactEmail = profile.kanzleiEmail.trim() || userEmail.trim();
    if (!profile.kanzleiName.trim() && !contactName && !contactEmail) {
      return;
    }
    const settings = normalizeKanzleiSettings({
      kanzleiName: profile.kanzleiName.trim(),
      anwaltName: contactName,
      kanzleiEmail: contactEmail,
      country: profile.country,
      stundensatz: billing.stundensatz,
      abrechnungstakt: billing.abrechnungstakt,
      iban: billing.iban.trim() || undefined,
      bankName: billing.bankName.trim() || undefined,
      rechtsgebietSaetze: profile.focus
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .reduce<Record<string, number>>((acc, item) => {
          acc[item] = parseInt(billing.stundensatz, 10) || 200;
          return acc;
        }, {}),
    });
    await saveKanzleiSettings(settings);
    // Mark firm setup as progressed; best-effort, not blocking
    api.onboarding.updateProgress({ firm: true }).catch(() => {});
  }, [profile, userEmail, userName, billing]);

  const finish = useCallback(async () => {
    setCompleting(true);
    try {
      await saveProfile();
      await csrfFetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, profile }),
      });
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      router.replace("/dashboard");
    } catch {
      setError(t("onboarding.error_complete"));
    }
    setCompleting(false);
  }, [industry, profile, qc, router, saveProfile, t]);

  const skipOnboarding = useCallback(async () => {
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
      router.replace("/dashboard");
    }
    setCompleting(false);
  }, [industry, qc, router]);

  const updateProfile = (key: keyof typeof profile, value: string) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="mx-auto flex min-h-full max-w-[720px] items-center justify-center p-4 md:p-6 lg:p-8">
      <div className="w-full">
        {/* Progress bar */}
        <div className="mb-6 flex items-center gap-2" aria-hidden>
          {STEPS.slice(0, -1).map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-[background-color] duration-[var(--ds-duration-normal)] motion-reduce:transition-none ${
                i <= currentIdx ? "bg-[color:var(--brand-solid)]" : "bg-[color:var(--ds-border)]"
              }`}
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
                  type="button"
                  onClick={skipOnboarding}
                  disabled={completing}
                  className="text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-text)] active:scale-[0.97] motion-reduce:transition-none"
                >
                  {t("onboarding.skip")}
                </button>
              )}
            </div>

            {/* Welcome */}
            {step === "welcome" && (
              <div className="space-y-4 text-center">
                <div className="brand-soft brand-border mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border">
                  <Landmark size={28} className="brand-text" aria-hidden />
                </div>
                <h1 className="font-display text-2xl font-semibold text-[color:var(--ds-text)]">
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

            {/* Profile */}
            {step === "profile" && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="brand-soft brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
                    <Scale size={18} className="brand-text" />
                  </div>
                  <div>
                    <h1 className="font-display text-lg font-semibold text-[color:var(--ds-text)]">
                      {t("onboarding.step_profile")}
                    </h1>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("onboarding.step_profile_desc")}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="ob-firm"
                      className="text-xs font-medium text-[color:var(--ds-text-muted)]"
                    >
                      {t("onboarding.profile_firm")}
                    </Label>
                    <Input
                      id="ob-firm"
                      value={profile.kanzleiName}
                      onChange={(e) => updateProfile("kanzleiName", e.target.value)}
                      placeholder="Kanzlei Muster"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="ob-owner"
                      className="text-xs font-medium text-[color:var(--ds-text-muted)]"
                    >
                      {t("onboarding.profile_owner")}
                    </Label>
                    <Input
                      id="ob-owner"
                      value={profile.anwaltName}
                      onChange={(e) => updateProfile("anwaltName", e.target.value)}
                      placeholder={userName || "Dr. Muster"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="ob-email"
                      className="text-xs font-medium text-[color:var(--ds-text-muted)]"
                    >
                      {t("onboarding.profile_email")}
                    </Label>
                    <Input
                      id="ob-email"
                      value={profile.kanzleiEmail}
                      onChange={(e) => updateProfile("kanzleiEmail", e.target.value)}
                      placeholder={userEmail || "office@kanzlei.at"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="ob-country"
                      className="text-xs font-medium text-[color:var(--ds-text-muted)]"
                    >
                      {t("onboarding.profile_country")}
                    </Label>
                    <Select
                      value={profile.country}
                      onValueChange={(v) => updateProfile("country", v)}
                    >
                      <SelectTrigger id="ob-country">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AT">Österreich</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="ob-role"
                      className="text-xs font-medium text-[color:var(--ds-text-muted)]"
                    >
                      {t("onboarding.profile_role")}
                    </Label>
                    <Select value={profile.role} onValueChange={(v) => updateProfile("role", v)}>
                      <SelectTrigger id="ob-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lawyer">{t("onboarding.role_lawyer")}</SelectItem>
                        <SelectItem value="assistant">{t("onboarding.role_assistant")}</SelectItem>
                        <SelectItem value="management">
                          {t("onboarding.role_management")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="ob-focus"
                      className="text-xs font-medium text-[color:var(--ds-text-muted)]"
                    >
                      {t("onboarding.profile_focus")}
                    </Label>
                    <Input
                      id="ob-focus"
                      value={profile.focus}
                      onChange={(e) => updateProfile("focus", e.target.value)}
                      placeholder={t("onboarding.profile_focus_hint")}
                    />
                  </div>
                </div>

                {error && (
                  <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
                    {error}
                  </p>
                )}

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

            {/* Billing Setup */}
            {step === "billing" && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="brand-soft brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
                    <CreditCard size={18} className="brand-text" />
                  </div>
                  <div>
                    <h1 className="font-display text-lg font-semibold text-[color:var(--ds-text)]">
                      {t("onboarding.step_billing")}
                    </h1>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("onboarding.step_billing_desc")}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="ob-rate"
                      className="text-xs font-medium text-[color:var(--ds-text-muted)]"
                    >
                      {t("onboarding.billing_rate")}
                    </Label>
                    <Input
                      id="ob-rate"
                      type="number"
                      inputMode="numeric"
                      value={billing.stundensatz}
                      min={1}
                      max={MAX_HOURLY_RATE_EUR}
                      // Prefilled with a suggestion: select it on focus so typing
                      // replaces it (typing "250" into "220" gave 220250 €/h).
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setBilling((b) => ({ ...b, stundensatz: e.target.value }))}
                      placeholder="220"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="ob-increment"
                      className="text-xs font-medium text-[color:var(--ds-text-muted)]"
                    >
                      {t("onboarding.billing_increment")}
                    </Label>
                    <Select
                      value={billing.abrechnungstakt}
                      onValueChange={(v) => setBilling((b) => ({ ...b, abrechnungstakt: v }))}
                    >
                      <SelectTrigger id="ob-increment">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">{t("onboarding.billing_increment_5")}</SelectItem>
                        <SelectItem value="10">{t("onboarding.billing_increment_10")}</SelectItem>
                        <SelectItem value="15">{t("onboarding.billing_increment_15")}</SelectItem>
                        <SelectItem value="30">{t("onboarding.billing_increment_30")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="ob-iban"
                      className="text-xs font-medium text-[color:var(--ds-text-muted)]"
                    >
                      {t("onboarding.billing_iban")}
                    </Label>
                    <Input
                      id="ob-iban"
                      value={billing.iban}
                      onChange={(e) => setBilling((b) => ({ ...b, iban: e.target.value }))}
                      placeholder="AT60 1234 5678 9012 3456"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="ob-bank"
                      className="text-xs font-medium text-[color:var(--ds-text-muted)]"
                    >
                      {t("onboarding.billing_bank")}
                    </Label>
                    <Input
                      id="ob-bank"
                      value={billing.bankName}
                      onChange={(e) => setBilling((b) => ({ ...b, bankName: e.target.value }))}
                      placeholder={t("onboarding.ph_bank")}
                    />
                  </div>
                </div>

                {error && (
                  <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
                    {error}
                  </p>
                )}

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

            {/* Upload */}
            {step === "upload" && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="brand-soft brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
                    <Upload size={18} className="brand-text" />
                  </div>
                  <div>
                    <h1 className="font-display text-lg font-semibold text-[color:var(--ds-text)]">
                      {t("onboarding.step_upload")}
                    </h1>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("onboarding.step_upload_desc")}
                    </p>
                  </div>
                </div>

                {uploaded ? (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--ds-success-bg)]">
                      <CheckCircle2 size={28} className="text-[color:var(--ds-success-text)]" />
                    </div>
                    <p className="text-sm font-medium text-[color:var(--ds-success-text)]">
                      Hochgeladen. Das Dokument wird jetzt erfasst und ist in Kürze durchsuchbar.
                    </p>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none ${
                      dragOver
                        ? "brand-border bg-[color:var(--brand-primary)]/5"
                        : "border-[color:var(--ds-border)] hover:border-[color:var(--brand-primary)]/30"
                    }`}
                  >
                    {uploading ? (
                      <div
                        className="flex flex-col items-center gap-2"
                        role="status"
                        aria-live="polite"
                      >
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
                      accept={UPLOAD_ACCEPT_ATTRIBUTE}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleFile(file);
                      }}
                    />
                  </div>
                )}

                {error && (
                  <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
                    {error}
                  </p>
                )}

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
                    <h1 className="font-display text-lg font-semibold text-[color:var(--ds-text)]">
                      {t("onboarding.step_query")}
                    </h1>
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
                    className="w-full resize-none rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:ring-2 focus:ring-[color:var(--brand-primary)]/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
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
                  <div
                    className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]"
                    role="status"
                    aria-live="polite"
                  >
                    <Loader2 size={14} className="animate-spin" />
                    {t("onboarding.step_query_thinking")}
                  </div>
                )}

                {queryAnswer && (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                    <p className="text-xs leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
                      {queryAnswer}
                    </p>
                    {queryGrounding !== undefined && (
                      <CitationPanel
                        data={
                          {
                            grounding: queryGrounding ?? null,
                            isStreaming: querying,
                          } satisfies CitationPanelData
                        }
                        compact
                      />
                    )}
                  </div>
                )}

                {error && (
                  <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
                    {error}
                  </p>
                )}

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
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--ds-success-bg)]">
                  <CheckCircle2 size={28} className="text-[color:var(--ds-success-text)]" />
                </div>
                <h1 className="font-display text-2xl font-semibold text-[color:var(--ds-text)]">
                  Einrichtung abgeschlossen
                </h1>
                <p className="mx-auto max-w-md text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
                  {t("onboarding.step_done_desc")}
                </p>
                <div className="pt-4">
                  <Button variant="glow" size="md" onClick={finish} loading={completing}>
                    Zur Übersicht <ArrowRight size={14} aria-hidden />
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
