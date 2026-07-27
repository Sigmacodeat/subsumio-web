"use client";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { csrfFetch } from "@/lib/csrf";
import type { RSVCaseData } from "@/lib/legal-insurance";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

export default function LegalInsurancePage() {
  const { t } = useLang();
  const tr = (key: string) => t(key as DashboardKey);
  const [items, setItems] = useState<RSVCaseData[]>([]);
  const [email, setEmail] = useState<{ subject: string; body: string } | null>(null);
  const [form, setForm] = useState({
    case_slug: "",
    client_name: "",
    insurance_provider: "",
    insurance_number: "",
    matter: "",
    legal_area: "",
    dispute_value: "",
  });
  const load = useCallback(async () => {
    const r = await fetch("/api/legal-insurance");
    const j = await r.json();
    setItems(j.data?.items ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit() {
    const r = await csrfFetch("/api/legal-insurance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        dispute_value: form.dispute_value ? Number(form.dispute_value) : undefined,
      }),
    });
    const j = await r.json();
    if (r.ok) {
      setEmail(j.data.inquiryEmail);
      await load();
    }
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={tr("workspace.rsv.title")}
        description={tr("workspace.rsv.description")}
        breadcrumbs={[{ label: t("breadcrumb.dashboard"), href: "/dashboard" }, { label: "RSV" }]}
      />
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="font-semibold">{tr("workspace.rsv.new")}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["case_slug", tr("workspace.rsv.case")],
            ["client_name", tr("workspace.rsv.client")],
            ["insurance_provider", tr("workspace.rsv.insurer")],
            ["insurance_number", tr("workspace.rsv.number")],
            ["legal_area", tr("workspace.rsv.area")],
            ["dispute_value", tr("workspace.rsv.value")],
          ].map(([key, label]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Input
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="md:col-span-2">
            <Label>{tr("workspace.rsv.matter")}</Label>
            <textarea
              className="min-h-24 w-full rounded-lg border bg-transparent p-3 text-sm"
              value={form.matter}
              onChange={(e) => setForm({ ...form, matter: e.target.value })}
            />
          </div>
        </div>
        <Button
          onClick={() => void submit()}
          disabled={
            !form.case_slug ||
            !form.client_name ||
            !form.insurance_provider ||
            !form.matter ||
            !form.legal_area
          }
        >
          {tr("workspace.rsv.create")}
        </Button>
      </section>
      {email && (
        <section className="space-y-2 rounded-xl border p-5">
          <h2 className="font-semibold">{tr("workspace.rsv.ready")}</h2>
          <p className="text-sm font-medium">{email.subject}</p>
          <pre className="rounded-lg bg-[color:var(--ds-surface-2)] p-4 text-xs whitespace-pre-wrap">
            {email.body}
          </pre>
        </section>
      )}
      <section className="rounded-xl border p-5">
        <h2 className="mb-3 font-semibold">{tr("workspace.rsv.status")}</h2>
        {items.length ? (
          items.map((i) => (
            <div key={i.id} className="flex justify-between border-t py-2 text-sm">
              <span>
                {i.client_name} · {i.insurance_provider}
              </span>
              <span>{i.coverage_status}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-[color:var(--ds-text-muted)]">{tr("workspace.rsv.empty")}</p>
        )}
      </section>
    </div>
  );
}
