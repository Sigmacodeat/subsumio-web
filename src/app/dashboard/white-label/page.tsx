"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { csrfFetch } from "@/lib/csrf";
import type { WhiteLabelConfig } from "@/lib/white-label";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
const fallback: WhiteLabelConfig = {
  firm_name: "",
  firm_short_name: "",
  firm_description: "",
  logo_url: "",
  theme_color: "#06060f",
  background_color: "#06060f",
  start_url: "/portal",
};
export default function WhiteLabelPage() {
  const { t } = useLang();
  const tr = (key: string) => t(key as DashboardKey);
  const [form, setForm] = useState<WhiteLabelConfig>(fallback);
  const [manifest, setManifest] = useState<Record<string, unknown>>({});
  useEffect(() => {
    void fetch("/api/white-label")
      .then((r) => r.json())
      .then((j) => {
        setForm(j.data?.config ?? fallback);
        setManifest(j.data?.manifest ?? {});
      });
  }, []);
  async function save() {
    const r = await csrfFetch("/api/white-label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = await r.json();
    if (r.ok) setManifest(j.data.manifest);
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={tr("workspace.white.title")}
        description={tr("workspace.white.description")}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "White Label" }]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-xl border p-5">
          {[
            ["firm_name", tr("workspace.white.firm")],
            ["firm_short_name", tr("workspace.white.short")],
            ["firm_description", tr("workspace.white.description_label")],
            ["logo_url", tr("workspace.white.logo")],
            ["start_url", tr("workspace.white.start")],
          ].map(([k, l]) => (
            <div key={k}>
              <Label>{l}</Label>
              <Input
                value={String(form[k as keyof WhiteLabelConfig] ?? "")}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            {[
              ["theme_color", tr("workspace.white.accent")],
              ["background_color", tr("workspace.white.background")],
            ].map(([k, l]) => (
              <div key={k}>
                <Label>{l}</Label>
                <Input
                  type="color"
                  value={String(form[k as keyof WhiteLabelConfig])}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <Button onClick={() => void save()} disabled={!form.firm_name}>
            {tr("workspace.white.save")}
          </Button>
        </section>
        <section className="overflow-hidden rounded-xl border">
          <div className="p-8 text-white" style={{ background: form.background_color }}>
            <Image
              src={form.logo_url || "/icon-192.png"}
              alt={tr("workspace.white.logo_alt")}
              width={64}
              height={64}
              className="mb-4 rounded-xl"
              unoptimized
            />
            <h2 className="text-2xl font-bold" style={{ color: form.theme_color }}>
              {form.firm_name || tr("workspace.white.fallback")}
            </h2>
            <p className="mt-2 text-sm">{form.firm_description}</p>
            <button
              className="mt-6 rounded-lg px-4 py-2 text-sm"
              style={{ background: form.theme_color }}
            >
              {tr("workspace.white.open")}
            </button>
          </div>
          <pre className="max-h-64 overflow-auto p-4 text-xs">
            {JSON.stringify(manifest, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  );
}
