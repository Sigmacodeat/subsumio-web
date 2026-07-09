"use client";

import { useCallback, useEffect, useState } from "react";
import { useDialogFetch } from "@/lib/use-dialog-fetch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  CalendarClock,
  AlertTriangle,
  Gavel,
  FileText,
  ChevronDown,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { api } from "@/lib/api";
import { isOnline, enqueueMutation } from "@/lib/offline-store";
import { useToast } from "@/components/ui/toast";
import { DEADLINE_RULES, computeDueDate, type DeadlineRule } from "@/lib/legal-deadlines";
import { computeVorfrist } from "@/lib/legal/vorfrist";
import { getRechtsraumParams } from "@/lib/legal/rechtsraum";
import { loadKanzleiSettings } from "@/lib/kanzlei-settings";
import type { BrainPage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";

interface ATFristResult {
  fristbeginn: string;
  fristende: string;
  vorfrist: string;
  hinweise: string[];
  art: { key: string; bezeichnung: string; rechtsgrundlage: string; is_notfrist: boolean };
}
interface ATFristResponse {
  ok: boolean;
  result: ATFristResult;
  availableArts: Array<{ key: string; bezeichnung: string; rechtsgrundlage: string }>;
}

interface DeadlineQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  presetCaseSlug?: string;
}

interface CaseOption {
  slug: string;
  title: string;
}

const TYPE_OPTIONS: Array<{ value: string; labelKey: DashboardKey; icon: typeof CalendarClock }> = [
  { value: "deadline", labelKey: "deadlines.type_deadline", icon: CalendarClock },
  { value: "event", labelKey: "deadlines.type_event", icon: FileText },
  { value: "hearing", labelKey: "deadlines.type_hearing", icon: Gavel },
  { value: "filing", labelKey: "deadlines.type_filing", icon: AlertTriangle },
];

export function DeadlineQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
  presetCaseSlug,
}: DeadlineQuickCreateDialogProps) {
  const { t, lang } = useLang();
  const { addToast } = useToast();

  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [caseSlug, setCaseSlug] = useState(presetCaseSlug ?? "");
  const [type, setType] = useState<string>("deadline");
  const [law, setLaw] = useState("");
  const [ruleKey, setRuleKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createAnother, setCreateAnother] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [calcPreview, setCalcPreview] = useState<string | null>(null);
  const [isNotfrist, setIsNotfrist] = useState(false);
  const [vorfristPreview, setVorfristPreview] = useState<string | null>(null);
  const [rechtsraum, setRechtsraum] = useState<{ state?: string; country?: string }>({});
  const [isErvDate, setIsErvDate] = useState(false);
  const [atFristResult, setAtFristResult] = useState<ATFristResult | null>(null);
  const [atFristLoading, setAtFristLoading] = useState(false);
  const [atFristError, setAtFristError] = useState<string | null>(null);

  const { data: cases, loading: loadingCases } = useDialogFetch<CaseOption[]>(open, async () => {
    const pages = await api.brain.listPages({ type: "legal_case", limit: 200 });
    return pages.map((p: BrainPage) => ({
      slug: p.slug,
      title: p.title || p.slug,
    }));
  });

  // Load Rechtsraum settings for holiday-aware calculation
  useEffect(() => {
    if (!open) return;
    loadKanzleiSettings()
      .then((s) => setRechtsraum(getRechtsraumParams(s)))
      .catch(() => {});
  }, [open]);

  // C2: When Rechtsraum is AT, delegate to the engine's frist-engine for
  // correct Zustellfiktionen, verhandlungsfreie Zeit, AVG rules, etc.
  useEffect(() => {
    if (!ruleKey || !date) {
      setCalcPreview(null);
      setAtFristResult(null);
      return;
    }
    if (rechtsraum.country === "AT") {
      const abort = new AbortController();
      setAtFristLoading(true);
      setAtFristError(null);
      const artKey = ruleKey;
      csrfFetch("/api/legal/frist/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artKey, zustellungIso: date }),
        signal: abort.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || "Engine not reachable");
          }
          const data = (await res.json()) as ATFristResponse;
          setAtFristResult(data.result);
          setCalcPreview(data.result.fristende);
          // Auto-set Notfrist flag from engine result — ensures Vier-Augen
          // enforcement and 7-day Vorfrist are applied for statutory deadlines.
          if (data.result.art.is_notfrist) setIsNotfrist(true);
        })
        .catch((err) => {
          if (err instanceof Error && err.name === "AbortError") return;
          setAtFristError(err instanceof Error ? err.message : "Engine error");
          // Fallback to web-lib calculation
          const rule = DEADLINE_RULES.find((r) => r.key === ruleKey);
          if (rule) {
            const { dueDate } = computeDueDate(rule, date, undefined, "AT");
            setCalcPreview(dueDate);
          }
        })
        .finally(() => setAtFristLoading(false));
      return () => abort.abort();
    }
    // Non-AT: use web-lib
    setAtFristResult(null);
    const rule = DEADLINE_RULES.find((r) => r.key === ruleKey);
    if (!rule) {
      setCalcPreview(null);
      return;
    }
    const { dueDate } = computeDueDate(
      rule,
      date,
      rechtsraum.state as never,
      rechtsraum.country as never
    );
    setCalcPreview(dueDate);
  }, [ruleKey, date, rechtsraum]);

  // Auto-compute Vorfrist from the final deadline date
  useEffect(() => {
    const finalDate = calcPreview || date;
    if (!finalDate) {
      setVorfristPreview(null);
      return;
    }
    const vf = computeVorfrist(
      finalDate,
      isNotfrist ? 7 : 0,
      rechtsraum.state as never,
      rechtsraum.country as never
    );
    setVorfristPreview(vf);
  }, [calcPreview, date, isNotfrist, rechtsraum.country, rechtsraum.state]);

  const resetForm = useCallback(() => {
    setDescription("");
    setDate(new Date().toISOString().split("T")[0]);
    setCaseSlug(presetCaseSlug ?? "");
    setType("deadline");
    setLaw("");
    setRuleKey("");
    setShowAdvanced(false);
    setCalcPreview(null);
    setIsNotfrist(false);
    setVorfristPreview(null);
    setIsErvDate(false);
  }, [presetCaseSlug]);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !date) return;
    setSubmitting(true);

    const selectedCase = (cases ?? []).find((c) => c.slug === caseSlug);
    const rule = DEADLINE_RULES.find((r) => r.key === ruleKey);
    const now = new Date();
    const titlePart = description
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 56);
    const finalDate = calcPreview || date;
    const slug = `legal/deadlines/${finalDate}-${titlePart || "frist"}-${now.getTime().toString(36)}`;

    const pagePayload = {
      slug,
      title: description.trim(),
      type: "legal_deadline" as const,
      content: rule
        ? `${rule.label}\n${rule.description}\n${rule.law}`
        : t("deadlines.manual_content" as DashboardKey),
      frontmatter: {
        type: "legal_deadline",
        event_type: type,
        due_date: finalDate,
        vorfrist_date: vorfristPreview || undefined,
        is_notfrist: isNotfrist || undefined,
        second_check_required: isNotfrist || undefined,
        description: description.trim(),
        status: "pending",
        review_status: "unreviewed",
        case_slug: caseSlug || undefined,
        case_title: selectedCase?.title,
        source: "manual",
        law: law.trim() || rule?.law,
        rule_key: rule?.key,
        erv_zustelldatum: isErvDate ? date : undefined,
        created_at: now.toISOString(),
      },
    };

    try {
      if (isOnline()) {
        await api.brain.createPage(pagePayload);
      } else {
        await enqueueMutation({ type: "createPage", payload: pagePayload });
      }
      addToast({ type: "success", title: t("deadlines.created" as DashboardKey) });
      if (createAnother) {
        resetForm();
        setSubmitting(false);
        return;
      }
      onOpenChange(false);
      if (onCreated) onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("deadlines.create_failed" as DashboardKey);
      addToast({ type: "error", title: msg });
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = description.trim().length > 0 && date.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col">
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-2">
              <div className="brand-soft brand-border flex h-8 w-8 items-center justify-center rounded-lg border">
                <CalendarClock size={16} className="brand-text" />
              </div>
              <DialogTitle>{t("deadlines.quick_title" as DashboardKey)}</DialogTitle>
            </div>
            <DialogDescription>{t("deadlines.quick_desc" as DashboardKey)}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-2">
            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="quick-deadline-desc" className="text-xs">
                {t("deadlines.create_description" as DashboardKey)} *
              </Label>
              <Input
                id="quick-deadline-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("deadlines.create_description_placeholder" as DashboardKey)}
                autoFocus
              />
            </div>

            {/* Date + Type */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quick-deadline-date" className="text-xs">
                  {t("deadlines.col_date" as DashboardKey)} *
                </Label>
                <Input
                  id="quick-deadline-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick-deadline-type" className="text-xs">
                  {t("deadlines.create_type" as DashboardKey)}
                </Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="quick-deadline-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => {
                      const Icon = o.icon;
                      return (
                        <SelectItem key={o.value} value={o.value}>
                          <span className="flex items-center gap-1.5">
                            <Icon size={13} />
                            {t(o.labelKey)}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Case — hidden when presetCaseSlug is provided */}
            {!presetCaseSlug && (
              <div className="space-y-1.5">
                <Label htmlFor="quick-deadline-case" className="text-xs">
                  {t("deadlines.col_case" as DashboardKey)}
                </Label>
                <Select value={caseSlug} onValueChange={setCaseSlug} disabled={loadingCases}>
                  <SelectTrigger id="quick-deadline-case">
                    <SelectValue placeholder={t("deadlines.no_case" as DashboardKey)} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t("deadlines.no_case" as DashboardKey)}</SelectItem>
                    {(cases ?? []).map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Advanced toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
            >
              <ChevronDown
                size={13}
                className={cn("transition-transform", showAdvanced && "rotate-180")}
              />
              {showAdvanced
                ? t("deadlines.quick_hide_advanced" as DashboardKey)
                : t("deadlines.quick_show_advanced" as DashboardKey)}
            </button>

            {/* Advanced: Rule + Law */}
            {showAdvanced && (
              <div className="space-y-4 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-deadline-rule" className="text-xs">
                      {t("deadlines.create_rule" as DashboardKey)}
                    </Label>
                    <Select
                      value={ruleKey}
                      onValueChange={(v) => {
                        setRuleKey(v);
                        const rule = DEADLINE_RULES.find((r) => r.key === v);
                        if (rule) setLaw(rule.law);
                      }}
                    >
                      <SelectTrigger id="quick-deadline-rule">
                        <SelectValue
                          placeholder={t("deadlines.create_rule_none" as DashboardKey)}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">
                          {t("deadlines.create_rule_none" as DashboardKey)}
                        </SelectItem>
                        {DEADLINE_RULES.map((rule: DeadlineRule) => (
                          <SelectItem key={rule.key} value={rule.key}>
                            {rule.label} ({rule.law})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-deadline-law" className="text-xs">
                      {t("deadlines.create_law" as DashboardKey)}
                    </Label>
                    <Input
                      id="quick-deadline-law"
                      value={law}
                      onChange={(e) => setLaw(e.target.value)}
                      placeholder="§ 222 ZPO"
                    />
                  </div>
                </div>

                {/* Calc preview */}
                {calcPreview && (
                  <div className="brand-border brand-soft rounded-lg border p-3">
                    <p className="brand-text text-xs font-medium">
                      {t("deadlines.calc_due" as DashboardKey)}{" "}
                      <strong>
                        {new Date(`${calcPreview}T12:00:00Z`).toLocaleDateString(
                          lang === "en" ? "en-GB" : "de-DE",
                          { weekday: "long", day: "numeric", month: "long", year: "numeric" }
                        )}
                      </strong>
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                      {Math.ceil(
                        (new Date(`${calcPreview}T12:00:00Z`).getTime() - new Date().getTime()) /
                          (1000 * 60 * 60 * 24)
                      )}{" "}
                      {t("deadlines.calc_remaining" as DashboardKey)}
                    </p>
                  </div>
                )}

                {/* C2: AT frist-engine hints */}
                {atFristLoading && (
                  <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                    <Loader2 size={12} className="animate-spin" />
                    {t("deadlines.at_engine_loading")}
                  </div>
                )}
                {atFristError && (
                  <div className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]">
                    {t("deadlines.at_engine_error")}
                  </div>
                )}
                {atFristResult && atFristResult.hinweise.length > 0 && (
                  <div className="rounded-lg border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] px-3 py-2">
                    <p className="mb-1 text-xs font-medium text-[color:var(--ds-info-text)]">{t("deadlines.at_engine_hints")}</p>
                    <ul className="space-y-0.5 text-xs text-[color:var(--ds-info-text)]">
                      {atFristResult.hinweise.map((h, i) => (
                        <li key={i}>• {h}</li>
                      ))}
                    </ul>
                    {atFristResult.vorfrist && (
                      <p className="mt-1.5 text-xs font-medium text-[color:var(--ds-info-text)]">
                        {t("deadlines.at_engine_vorfrist")}: {atFristResult.vorfrist}
                      </p>
                    )}
                  </div>
                )}

                {/* Notfrist + Vorfrist + ERV */}
                <div className="space-y-3 border-t border-[color:var(--ds-border)] pt-3">
                  {/* ERV-Zustelldatum toggle */}
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={isErvDate}
                      onChange={(e) => setIsErvDate(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-[color:var(--ds-border-strong)] accent-blue-600"
                    />
                    <div>
                      <span className="text-xs font-medium text-[color:var(--ds-text)]">
                        {t("deadlines.erv_date")}
                      </span>
                      <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                        {t("deadlines.erv_date_hint")}
                      </p>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={isNotfrist}
                      onChange={(e) => setIsNotfrist(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-[color:var(--ds-border-strong)] accent-amber-600"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck size={13} className="text-[color:var(--ds-warning-text)]" />
                        <span className="text-xs font-medium text-[color:var(--ds-text)]">
                          {t("deadlines.notfrist_label")}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                        {t("deadlines.notfrist_desc")}
                      </p>
                    </div>
                  </label>

                  {vorfristPreview && (
                    <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] px-3 py-2">
                      <Clock size={13} className="shrink-0 text-[color:var(--ds-info-text)]" />
                      <div className="text-xs">
                        <span className="text-[color:var(--ds-text-muted)]">Vorfrist: </span>
                        <strong className="text-[color:var(--ds-info-text)]">
                          {new Date(`${vorfristPreview}T12:00:00Z`).toLocaleDateString(
                            lang === "en" ? "en-GB" : "de-DE",
                            { weekday: "short", day: "numeric", month: "short", year: "numeric" }
                          )}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-[color:var(--ds-border)] px-6 py-4">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
                <input
                  type="checkbox"
                  checked={createAnother}
                  onChange={(e) => setCreateAnother(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[color:var(--ds-border)]"
                />
                {t("deadlines.create_another" as DashboardKey)}
              </label>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-[color:var(--ds-text-muted)]"
              >
                {t("deadlines.quick_cancel" as DashboardKey)}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={submitting || !canSubmit}
                className="brand-bg gap-2 text-white"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {t("deadlines.create" as DashboardKey)}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
