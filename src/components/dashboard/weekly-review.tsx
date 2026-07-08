"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, X } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { Button } from "@/components/ui/button";

const ITEMS = ["deadlines", "followups", "billing", "invoices", "inbox", "bea"] as const;

function weekKey() {
  const date = new Date();
  const first = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - first.getTime()) / 86400000 + first.getDay() + 1) / 7);
  return `${date.getFullYear()}-${week}`;
}

export function WeeklyReview() {
  const { t } = useLang();
  const key = useMemo(() => `subsumio:weekly-review:${weekKey()}`, []);
  const [open, setOpen] = useState(() => typeof window !== "undefined" && !localStorage.getItem(key));
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const now = new Date();
  const due = now.getDay() === 5 && now.getHours() >= 16;
  if (!open || !due) return null;
  const complete = ITEMS.every((item) => checked[item]);
  return <section className="rounded-xl border border-[color:var(--brand-primary)]/25 bg-[color:var(--brand-glow)] p-4" aria-labelledby="weekly-review-title"><div className="flex items-start gap-3"><ClipboardCheck className="mt-0.5 text-[color:var(--brand-primary)]" size={20} aria-hidden="true" /><div className="flex-1"><h2 id="weekly-review-title" className="font-semibold text-[color:var(--ds-text)]">{t("weekly.title")}</h2><p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">{t("weekly.description")}</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{ITEMS.map((item) => <label key={item} className="flex cursor-pointer items-center gap-2 rounded-lg bg-[color:var(--ds-surface)] px-3 py-2 text-sm"><input type="checkbox" checked={Boolean(checked[item])} onChange={(event) => setChecked((current) => ({ ...current, [item]: event.target.checked }))} />{t(`weekly.${item}`)}</label>)}</div>{complete && <Button className="mt-4" onClick={() => { localStorage.setItem(key, new Date().toISOString()); setOpen(false); }}>{t("weekly.complete")}</Button>}</div><button type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} className="rounded-md p-1 text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"><X size={16} /></button></div></section>;
}
