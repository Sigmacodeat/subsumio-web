"use client";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { csrfFetch } from "@/lib/csrf";
import type { BenchmarkMetric } from "@/lib/peer-benchmark";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
export default function PeerBenchmarkPage() {
  const { t } = useLang();
  const tr = (key: string) => t(key as DashboardKey);
  const [metrics, setMetrics] = useState<BenchmarkMetric[]>([]);
  const [min, setMin] = useState(5);
  const [form, setForm] = useState({
    firm_id: "",
    legal_area: "",
    total_cases: "",
    won_cases: "",
    durations: "",
    period_from: "",
    period_to: "",
  });
  async function load() {
    const r = await fetch("/api/peer-benchmark");
    const j = await r.json();
    setMetrics(j.data?.metrics ?? []);
    setMin(j.data?.minFirms ?? 5);
  }
  useEffect(() => {
    void load();
  }, []);
  async function submit() {
    await csrfFetch("/api/peer-benchmark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        total_cases: Number(form.total_cases),
        won_cases: Number(form.won_cases),
        durations: form.durations.split(",").map(Number).filter(Number.isFinite),
      }),
    });
    await load();
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={tr("workspace.benchmark.title")}
        description={`${tr("workspace.benchmark.description")} (k ≥ ${min})`}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Benchmark" }]}
      />
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="font-semibold">{tr("workspace.benchmark.contribute")}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["firm_id", tr("workspace.benchmark.firm")],
            ["legal_area", tr("workspace.benchmark.area")],
            ["total_cases", tr("workspace.benchmark.total")],
            ["won_cases", tr("workspace.benchmark.won")],
            ["durations", tr("workspace.benchmark.durations")],
            ["period_from", tr("workspace.benchmark.from")],
            ["period_to", tr("workspace.benchmark.to")],
          ].map(([k, l]) => (
            <div key={k}>
              <Label>{l}</Label>
              <Input
                type={k.startsWith("period") ? "date" : "text"}
                value={form[k as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <Button onClick={() => void submit()}>{tr("workspace.benchmark.submit")}</Button>
      </section>
      <section className="rounded-xl border p-5">
        <h2 className="mb-3 font-semibold">{tr("workspace.benchmark.groups")}</h2>
        {metrics.length ? (
          metrics.map((m) => (
            <div key={m.legal_area} className="grid grid-cols-4 border-t py-3 text-sm">
              <span>{m.legal_area}</span>
              <span>
                {Math.round(m.avg_realization_rate * 100)} % {tr("workspace.benchmark.success")}
              </span>
              <span>
                {m.median_throughput_days} {tr("workspace.benchmark.days")}
              </span>
              <span>
                {m.firm_count} {tr("workspace.benchmark.firms")}
              </span>
            </div>
          ))
        ) : (
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            {tr("workspace.benchmark.empty")}
          </p>
        )}
      </section>
    </div>
  );
}
