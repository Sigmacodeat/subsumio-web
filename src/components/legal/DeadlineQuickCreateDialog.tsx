"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { emitDeadlineCreated } from "@/lib/matter-events";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { computeFrist, fristOptionsFor, type FristComputation } from "@/lib/legal/frist-options";
import { computeVorfrist, DEFAULT_VORFRIST_DAYS } from "@/lib/legal/vorfrist";
import { getRechtsraumParams } from "@/lib/legal/rechtsraum";
import { loadKanzleiSettingsStrict } from "@/lib/kanzlei-settings";
import { isTombstoned } from "@/lib/tombstone";
import type { BrainPage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { zonedDateString } from "@/lib/datetime";
import {
  FerialsacheField,
  ferialsacheAnswerMissing,
  ferialsacheQuestionVisible,
  type FerialsacheAnswer,
} from "@/components/legal/ferialsache-field";

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
  const [date, setDate] = useState(zonedDateString(new Date()));
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
  // The Rechtsraum decides which deadline engine runs (AT/DE/CH). Until it is
  // known — or when it cannot be read — no statutory deadline is computed:
  // a silent default would give a German firm the Austrian engine.
  const [settingsState, setSettingsState] = useState<"loading" | "ok" | "error">("loading");
  const [settingsReload, setSettingsReload] = useState(0);
  const [isErvDate, setIsErvDate] = useState(false);
  const [fristCalc, setFristCalc] = useState<FristComputation | null>(null);
  const [fristError, setFristError] = useState<string | null>(null);
  const [ferialsache, setFerialsache] = useState<FerialsacheAnswer>(null);
  const fristOptions = useMemo(() => fristOptionsFor(rechtsraum.country), [rechtsraum.country]);

  const { data: cases, loading: loadingCases } = useDialogFetch<CaseOption[]>(open, async () => {
    // The engine returns at most 100 pages per request: page through all
    // matters (deleted ones included while paging, filtered afterwards).
    const pages: BrainPage[] = [];
    for (let offset = 0; offset < 5_000; offset += 100) {
      const batch = await api.brain.listPages({
        type: "legal_case",
        limit: 100,
        offset,
        includeTombstoned: true,
      });
      pages.push(...batch);
      if (batch.length < 100) break;
    }
    // Paging by "recently updated" can return a page twice when it changes
    // meanwhile — dedupe on slug so the picker can't show a case twice.
    const unique = [...new Map(pages.map((p) => [p.slug, p])).values()];
    return unique
      .filter((p) => !isTombstoned(p))
      .map((p: BrainPage) => ({
        slug: p.slug,
        title: p.title || p.slug,
      }));
  });

  // Load Rechtsraum settings for holiday-aware calculation
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSettingsState("loading");
    loadKanzleiSettingsStrict()
      .then((s) => {
        if (cancelled) return;
        setRechtsraum(getRechtsraumParams(s));
        setSettingsState("ok");
      })
      .catch(() => {
        if (!cancelled) setSettingsState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [open, settingsReload]);

  // Every manual deadline goes through computeFrist: Austrian firms (and
  // firms without a Rechtsraum) get the deterministic frist-engine with
  // § 222 ZPO and § 89a GOG; an unknown key is shown as an error, never
  // recomputed with another country's rules.
  useEffect(() => {
    if (!ruleKey || !date) {
      setCalcPreview(null);
      setFristCalc(null);
      setFristError(null);
      return;
    }
    if (settingsState !== "ok") {
      // Never compute with a guessed jurisdiction.
      setCalcPreview(null);
      setFristCalc(null);
      setFristError(
        settingsState === "error"
          ? "Kanzlei-Einstellungen (Rechtsraum) konnten nicht geladen werden — die Frist wird nicht berechnet."
          : null
      );
      return;
    }
    try {
      const result = computeFrist(ruleKey, date, {
        country: rechtsraum.country,
        state: rechtsraum.state,
        ervEinlangen: isErvDate,
        ferialsache: ferialsache === true,
      });
      setFristCalc(result);
      setFristError(null);
      setCalcPreview(result.dueDate);
      // Statutory Notfristen always get the Vier-Augen check.
      if (result.notfrist) setIsNotfrist(true);
    } catch (err) {
      setFristCalc(null);
      setCalcPreview(null);
      setFristError(err instanceof Error ? err.message : String(err));
    }
  }, [ruleKey, date, rechtsraum, isErvDate, settingsState, ferialsache]);

  // Auto-compute Vorfrist from the final deadline date
  useEffect(() => {
    if (fristCalc?.vorfrist) {
      setVorfristPreview(fristCalc.vorfrist);
      return;
    }
    const finalDate = calcPreview || date;
    if (!finalDate) {
      setVorfristPreview(null);
      return;
    }
    // Every deadline gets the standard 7-day control deadline (Vorfrist).
    // 0 days would make the Vorfrist equal to the due date, which the
    // Fristenbuch then showed as "Vorfrist: <Fristdatum>" — no buffer at all.
    const vf = computeVorfrist(
      finalDate,
      DEFAULT_VORFRIST_DAYS,
      rechtsraum.state as never,
      rechtsraum.country as never
    );
    setVorfristPreview(vf);
  }, [calcPreview, date, fristCalc, rechtsraum.country, rechtsraum.state]);

  const resetForm = useCallback(() => {
    setDescription("");
    setDate(zonedDateString(new Date()));
    setCaseSlug(presetCaseSlug ?? "");
    setType("deadline");
    setLaw("");
    setRuleKey("");
    setShowAdvanced(false);
    setCalcPreview(null);
    setIsNotfrist(false);
    setVorfristPreview(null);
    setIsErvDate(false);
    setFristCalc(null);
    setFristError(null);
    setFerialsache(null);
  }, [presetCaseSlug]);

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }
    // The dialog is mounted once in the dashboard shell; the matter page hands
    // its slug over together with open=true (same render). Initial state was
    // captured at mount, so apply the preset on every open — otherwise the
    // case selector is hidden AND the deadline is saved without a case.
    setCaseSlug(presetCaseSlug ?? "");
  }, [open, presetCaseSlug, resetForm]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !date) return;
    if (ferialsacheAnswerMissing(fristCalc, ferialsache)) return;
    setSubmitting(true);

    const selectedCase = (cases ?? []).find((c) => c.slug === caseSlug);
    const rule = fristCalc;
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
        ? [`${rule.label} (${rule.law})`, ...rule.hinweise].join("\n")
        : t("deadlines.manual_content" as DashboardKey),
      frontmatter: {
        type: "legal_deadline",
        event_type: type,
        due_date: finalDate,
        vorfrist_date: vorfristPreview || undefined,
        is_notfrist: isNotfrist || undefined,
        // A period extended by the verhandlungsfreie Zeit is only right if the
        // matter is no Ferialsache — a second person confirms that.
        second_check_required: isNotfrist || rule?.vhfzVerlaengert || undefined,
        ferialsache: rule?.ferialsacheRelevant ? ferialsache === true : undefined,
        description: description.trim(),
        status: "pending",
        review_status: "unreviewed",
        case_slug: caseSlug || undefined,
        case_title: selectedCase?.title,
        source: "manual",
        law: law.trim() || rule?.law,
        rule_key: rule?.key,
        fristbeginn: rule?.fristbeginn,
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
      // The matter page (header counters + Fristen tab) refetches on this.
      emitDeadlineCreated(caseSlug || undefined);
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

  const canSubmit =
    description.trim().length > 0 &&
    date.length > 0 &&
    !ferialsacheAnswerMissing(fristCalc, ferialsache);

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
            {settingsState === "error" && (
              <div
                role="alert"
                className="flex items-start justify-between gap-3 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-xs text-[color:var(--ds-danger-text)]"
              >
                <span>
                  Die Kanzlei-Einstellungen (Rechtsraum) konnten nicht geladen werden. Fristen
                  werden nicht automatisch berechnet, bis sie verfügbar sind — sonst würde womöglich
                  das Fristenrecht eines anderen Landes angewendet.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSettingsReload((n) => n + 1)}
                  className="h-auto shrink-0 px-2 py-1 text-xs text-[color:var(--ds-danger-text)]"
                >
                  Erneut laden
                </Button>
              </div>
            )}
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
              className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
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
              <div className="space-y-4 rounded-xl border border-[color:var(--ds-border-strong)] p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-deadline-rule" className="text-xs">
                      {t("deadlines.create_rule" as DashboardKey)}
                    </Label>
                    <Select
                      value={ruleKey}
                      onValueChange={(v) => {
                        setRuleKey(v);
                        const option = fristOptions.find((o) => o.key === v);
                        if (option) setLaw(option.law);
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
                        {fristOptions.map((option) => (
                          <SelectItem key={option.key} value={option.key}>
                            {option.group ? `${option.group}: ` : ""}
                            {option.label} ({option.law})
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

                {ferialsacheQuestionVisible(fristCalc, ferialsache) && (
                  <FerialsacheField
                    id="quick-deadline-ferialsache"
                    value={ferialsache}
                    onChange={setFerialsache}
                    missing={ferialsacheAnswerMissing(fristCalc, ferialsache)}
                  />
                )}

                {fristError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]"
                  >
                    {t("deadlines.at_engine_error")} {fristError}
                  </div>
                )}
                {fristCalc && fristCalc.hinweise.length > 0 && (
                  <div className="rounded-lg border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] px-3 py-2">
                    <p className="mb-1 text-xs font-medium text-[color:var(--ds-info-text)]">
                      {t("deadlines.at_engine_hints")}
                    </p>
                    <ul className="space-y-0.5 text-xs text-[color:var(--ds-info-text)]">
                      {fristCalc.hinweise.map((h, i) => (
                        <li key={i}>• {h}</li>
                      ))}
                    </ul>
                    {fristCalc.vorfrist && (
                      <p className="mt-1.5 text-xs font-medium text-[color:var(--ds-info-text)]">
                        {t("deadlines.at_engine_vorfrist")}: {fristCalc.vorfrist}
                      </p>
                    )}
                  </div>
                )}

                {/* Notfrist + Vorfrist + ERV */}
                <div className="space-y-3 border-t border-[color:var(--ds-border)] pt-3">
                  {/* ERV-Zustelldatum toggle */}
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="deadline-erv-date"
                      checked={isErvDate}
                      onCheckedChange={(v) => setIsErvDate(v === true)}
                      className="mt-0.5"
                    />
                    <div>
                      <Label
                        htmlFor="deadline-erv-date"
                        className="cursor-pointer text-xs font-medium text-[color:var(--ds-text)]"
                      >
                        {t("deadlines.erv_date")}
                      </Label>
                      <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                        {t("deadlines.erv_date_hint")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="deadline-notfrist"
                      checked={isNotfrist}
                      onCheckedChange={(v) => setIsNotfrist(v === true)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck size={13} className="text-[color:var(--ds-warning-text)]" />
                        <Label
                          htmlFor="deadline-notfrist"
                          className="cursor-pointer text-xs font-medium text-[color:var(--ds-text)]"
                        >
                          {t("deadlines.notfrist_label")}
                        </Label>
                      </div>
                      <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                        {t("deadlines.notfrist_desc")}
                      </p>
                    </div>
                  </div>

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
              <Checkbox
                id="deadline-create-another"
                checked={createAnother}
                onCheckedChange={(v) => setCreateAnother(v === true)}
              />
              <Label
                htmlFor="deadline-create-another"
                className="text-xs font-normal text-[color:var(--ds-text-muted)]"
              >
                {t("deadlines.create_another" as DashboardKey)}
              </Label>
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
