"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { csrfFetch } from "@/lib/csrf";
import type { DatevDirectExport } from "@/lib/datev-direct";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
export default function DatevDirectPage() {
  const { t } = useLang();
  const tr = (key: string) => t(key as DashboardKey);
  const [items, setItems] = useState<DatevDirectExport[]>([]);
  const [form, setForm] = useState({
    type: "invoices",
    period_from: "",
    period_to: "",
    invoice_number: "",
    invoice_date: "",
    client_name: "",
    net_amount: "",
    tax_rate: "19",
  });
  const load = useCallback(async () => {
    const r = await fetch("/api/datev-direct");
    const j = await r.json();
    setItems(j.data?.items ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit() {
    const invoices =
      form.type === "invoices" && form.invoice_number
        ? [
            {
              invoice_number: form.invoice_number,
              invoice_date: form.invoice_date,
              client_name: form.client_name,
              net_amount: Number(form.net_amount),
              tax_rate: Number(form.tax_rate),
            },
          ]
        : undefined;
    await csrfFetch("/api/datev-direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type,
        period_from: form.period_from,
        period_to: form.period_to,
        invoices,
      }),
    });
    await load();
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={tr("workspace.datev.title")}
        description={tr("workspace.datev.description")}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "DATEV Direct" }]}
      />
      <div className="rounded-xl border border-amber-500 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-300">
              {tr("workspace.datev.notice_title")}
            </p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400/80">
              {tr("workspace.datev.notice_body")}{" "}
              <Link href="/dashboard/datev-export" className="underline">
                {tr("workspace.datev.notice_link")}
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="font-semibold">{tr("workspace.datev.start")}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>{tr("workspace.datev.type")}</Label>
            <select
              className="w-full rounded-lg border bg-transparent p-2"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="invoices">{tr("workspace.datev.invoices")}</option>
              <option value="bookings">{tr("workspace.datev.bookings")}</option>
              <option value="master_data">{tr("workspace.datev.master")}</option>
            </select>
          </div>
          {[
            ["period_from", tr("workspace.datev.from"), "date"],
            ["period_to", tr("workspace.datev.to"), "date"],
            ["invoice_number", tr("workspace.datev.number"), "text"],
            ["invoice_date", tr("workspace.datev.date"), "date"],
            ["client_name", tr("workspace.datev.client"), "text"],
            ["net_amount", tr("workspace.datev.net"), "number"],
            ["tax_rate", tr("workspace.datev.tax"), "number"],
          ].map(([k, l, t]) => (
            <div key={k}>
              <Label>{l}</Label>
              <Input
                type={t}
                value={form[k as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <Button onClick={() => void submit()} disabled={!form.period_from || !form.period_to}>
          {tr("workspace.datev.create")}
        </Button>
      </section>
      <section className="rounded-xl border p-5">
        <h2 className="mb-3 font-semibold">{tr("workspace.datev.history")}</h2>
        {items.map((i) => (
          <div key={i.id} className="grid grid-cols-4 border-t py-2 text-sm">
            <span>{i.type}</span>
            <span>
              {i.period.from}–{i.period.to}
            </span>
            <span>
              {i.record_count} {tr("workspace.datev.records")}
            </span>
            <span>{i.status}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
