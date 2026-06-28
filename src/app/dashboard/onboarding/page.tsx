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
  Smartphone,
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
import { normalizeKanzleiSettings, saveKanzleiSettings } from "@/lib/kanzlei-settings";
import { UPLOAD_ACCEPT_ATTRIBUTE } from "@/lib/upload-formats";

type Step =
  | "welcome"
  | "industry"
  | "profile"
  | "whatsapp"
  | "billing"
  | "upload"
  | "query"
  | "done";

const STEPS: Step[] = [
  "welcome",
  "industry",
  "profile",
  "whatsapp",
  "billing",
  "upload",
  "query",
  "done",
];
const STEP_INDEX: Record<Step, number> = {
  welcome: 0,
  industry: 1,
  profile: 2,
  whatsapp: 3,
  billing: 4,
  upload: 5,
  query: 6,
  done: 7,
};

export default function OnboardingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const meQuery = useMe();
  const { t } = useLang();
  const [step, setStep] = useState<Step>("welcome");
  const [industry, setIndustry] = useState<string | null>("legal");
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
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappConnected, setWhatsappConnected] = useState(false);
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
    try {
      const result = await api.query.think(queryText.trim(), {
        mode: "balanced",
        queryMode: "balanced",
        onChunk: (chunk) => {
          setQueryAnswer((prev) => (prev ?? "") + chunk);
        },
      });
      if (!result.answer && !queryAnswer) {
        setQueryAnswer(result.answer || "—");
      }
    } catch {
      setError(t("onboarding.error_query"));
    }
    setQuerying(false);
  }, [queryText, t, queryAnswer]);

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
        body: JSON.stringify({ industry: null }),
      });
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      router.replace("/dashboard");
    } catch {
      router.replace("/dashboard");
    }
    setCompleting(false);
  }, [qc, router]);

  const updateProfile = (key: keyof typeof profile, value: string) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  return (
    <div
      className="flex min-h-full items-center justify-center p-4 md:p-8"
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
              className={`h-1.5 rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
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
                    className={`flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
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
                    className={`flex items-center gap-4 rounded-xl border-2 p-4 text-left opacity-70 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
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
                        Subsumio ist aktuell fuer Kanzlei-Workflows optimiert
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

            {/* Profile */}
            {step === "profile" && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="brand-soft brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
                    <Scale size={18} className="brand-text" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[color:var(--ds-text)]">
                      {t("onboarding.step_profile")}
                    </h2>
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
                        <SelectItem value="DE">Deutschland</SelectItem>
                        <SelectItem value="CH">Schweiz</SelectItem>
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

            {/* WhatsApp Setup */}
            {step === "whatsapp" && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="brand-soft brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
                    <Smartphone size={18} className="brand-text" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[color:var(--ds-text)]">
                      {t("onboarding.step_whatsapp")}
                    </h2>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("onboarding.step_whatsapp_desc")}
                    </p>
                  </div>
                </div>

                {whatsappConnected ? (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                      <CheckCircle2 size={24} className="text-emerald-600" />
                    </div>
                    <p className="text-sm font-medium text-emerald-700">
                      {t("onboarding.whatsapp_connected")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="ob-wa-phone"
                        className="text-xs font-medium text-[color:var(--ds-text-muted)]"
                      >
                        {t("onboarding.whatsapp_phone")}
                      </Label>
                      <Input
                        id="ob-wa-phone"
                        value={whatsappPhone}
                        onChange={(e) => setWhatsappPhone(e.target.value)}
                        placeholder={t("onboarding.whatsapp_phone_hint")}
                      />
                    </div>
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                      <p className="text-xs text-amber-600">
                        Für WhatsApp Business wird ein Meta-Webhook benötigt. Nach dem Onboarding
                        kannst du die Webhook-URL im Dashboard konfigurieren.
                      </p>
                    </div>
                  </div>
                )}

                {error && <p className="text-xs text-red-600">{error}</p>}

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" size="sm" onClick={back}>
                    <ArrowLeft size={14} /> {t("onboarding.back")}
                  </Button>
                  <div className="flex gap-2">
                    {!whatsappConnected && (
                      <Button variant="ghost" size="sm" onClick={next}>
                        {t("onboarding.whatsapp_skip")} <ArrowRight size={14} />
                      </Button>
                    )}
                    <Button
                      variant="glow"
                      size="sm"
                      onClick={() => {
                        if (whatsappPhone.trim()) {
                          setWhatsappConnected(true);
                        }
                        next();
                      }}
                    >
                      {t("onboarding.next")} <ArrowRight size={14} />
                    </Button>
                  </div>
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
                    <h2 className="text-lg font-bold text-[color:var(--ds-text)]">
                      {t("onboarding.step_billing")}
                    </h2>
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
                      value={billing.stundensatz}
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
                      placeholder="Bank Austria"
                    />
                  </div>
                </div>

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
                    className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
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
                      accept={UPLOAD_ACCEPT_ATTRIBUTE}
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
                  <CheckCircle2 size={28} className="text-emerald-600" />
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
