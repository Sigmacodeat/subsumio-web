"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLang } from "@/lib/use-lang";
import { calculateStBVV, STBVV_ACTIVITIES, type StBVVActivity } from "@/lib/stbvv";

function formatCurrency(n: number, locale: string) {
  return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TaxStBVVPage() {
  const { t, lang } = useLang();
  const locale = lang === "en" ? "en-GB" : "de-DE";
  const [value, setValue] = useState<string>("5000");
  const [activity, setActivity] = useState<StBVVActivity>("steuererklaerung");
  const [factor, setFactor] = useState<number | null>(null);

  const activityConfig = useMemo(
    () => STBVV_ACTIVITIES.find((a) => a.value === activity) ?? STBVV_ACTIVITIES[2],
    [activity]
  );

  const parsedValue = useMemo(() => {
    const n = Number(value.replace(/[^\d,.-]/g, "").replace(/,/g, "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [value]);

  const result = useMemo(
    () => calculateStBVV(parsedValue, activity, factor ?? undefined),
    [parsedValue, activity, factor]
  );

  const handleReset = () => {
    setValue("5000");
    setActivity("steuererklaerung");
    setFactor(null);
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader title={t("tax.stbvv.title")} description={t("tax.stbvv.desc")} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="space-y-5">
            <div>
              <Label htmlFor="stbvv-value">{t("tax.stbvv.label_value")}</Label>
              <Input
                id="stbvv-value"
                type="number"
                min={0}
                step={100}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="mt-1.5"
                placeholder="0,00"
              />
            </div>

            <div>
              <Label htmlFor="stbvv-activity">{t("tax.stbvv.label_activity")}</Label>
              <Select value={activity} onValueChange={(v) => setActivity(v as StBVVActivity)}>
                <SelectTrigger id="stbvv-activity" className="mt-1.5">
                  <SelectValue placeholder={activityConfig.label} />
                </SelectTrigger>
                <SelectContent>
                  {STBVV_ACTIVITIES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="stbvv-factor">{t("tax.stbvv.label_factor")}</Label>
                <span className="text-sm font-medium text-[color:var(--brand-primary)]">
                  {factor === null ? result.activityFactor.toFixed(2) : factor.toFixed(2)}
                </span>
              </div>
              <Input
                id="stbvv-factor"
                type="number"
                min={0.5}
                max={10}
                step={0.1}
                value={factor === null ? result.activityFactor.toFixed(2) : factor.toFixed(2)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) setFactor(n);
                }}
                className="mt-1.5"
              />
              <p className="mt-2 text-xs text-[color:var(--ds-text-muted)]">
                {t("tax.stbvv.range_hint")
                  .replace(
                    "{min}",
                    result.activityFactor ? (result.activityFactor * 0.5).toFixed(2) : "0.50"
                  )
                  .replace(
                    "{max}",
                    result.activityFactor ? (result.activityFactor * 2.5).toFixed(2) : "2.50"
                  )}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw size={14} /> {t("tax.stbvv.reset")}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-[color:var(--ds-text)]">
            {t("tax.stbvv.result_title")}
          </h3>
          <div className="space-y-3">
            <ResultRow label={t("tax.stbvv.vv")} value={result.vvNummer} />
            <ResultRow
              label={t("tax.stbvv.basis_fee")}
              value={`${formatCurrency(result.basisGebuehr, locale)} €`}
            />
            <ResultRow
              label={t("tax.stbvv.fee")}
              value={`${formatCurrency(result.gebuehrNetto, locale)} €`}
              highlight
            />
            <div className="grid grid-cols-2 gap-3">
              <ResultRow
                label={t("tax.stbvv.min_fee")}
                value={`${formatCurrency(result.minGebuehr, locale)} €`}
              />
              <ResultRow
                label={t("tax.stbvv.max_fee")}
                value={`${formatCurrency(result.maxGebuehr, locale)} €`}
              />
            </div>
            <ResultRow
              label={t("tax.stbvv.expense")}
              value={`${formatCurrency(result.auslagenpauschale, locale)} €`}
            />
            <div className="my-3 border-t border-[color:var(--ds-border)]" />
            <ResultRow
              label={t("tax.stbvv.net_total")}
              value={`${formatCurrency(result.summeNetto, locale)} €`}
            />
            <ResultRow
              label={t("tax.stbvv.vat")}
              value={`${formatCurrency(result.mwst, locale)} €`}
            />
            <ResultRow
              label={t("tax.stbvv.gross_total")}
              value={`${formatCurrency(result.summeBrutto, locale)} €`}
              brand
            />
          </div>
          <p className="mt-4 text-xs text-[color:var(--ds-text-muted)]">
            § 34 StBVV i.V.m. Anlage 1. Die Berechnung ist ein verbindlicher Orientierungswert;
            konkrete Vereinbarungen bleiben vorbehalten.
          </p>
        </Card>
      </div>
    </div>
  );
}

function ResultRow({
  label,
  value,
  highlight,
  brand,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  brand?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[color:var(--ds-text-muted)]">{label}</span>
      <span
        className={`text-sm font-medium ${
          brand
            ? "text-[color:var(--brand-primary)]"
            : highlight
              ? "text-[color:var(--ds-text)]"
              : "text-[color:var(--ds-text-subtle)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
