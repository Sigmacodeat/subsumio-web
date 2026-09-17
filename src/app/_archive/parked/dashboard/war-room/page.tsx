"use client";

// Perspektivenraum — grounded multi-role adversarial reasoning.
// Richter/Gegenanwalt/Mandant (+ Geschworene/Schöffen where the case type
// actually has one) each read the same matter record. No numeric win
// probabilities or settlement ranges — every role's text is grounded via
// useGroundedAnswer + CitationPanel like the rest of the litigation surfaces
// (process-strategy, red-team), with the "anwaltlich zu prüfen" badge on by
// default. See lib/perspektivenraum-agent.ts for the prompt/parsing layer.

import { useEffect, useState, useCallback } from "react";
import { Loader2, Users, Send } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { PerspektivenSessionCard } from "./perspektivenraum-cards";
import {
  DEFAULT_DIALS,
  type PerspektivenDials,
  type PerspektivenSession,
} from "@/lib/perspektivenraum-agent";

import { unwrapApiBody } from "@/lib/api-body";
export default function PerspektivenraumPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [sessions, setSessions] = useState<PerspektivenSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [caseSlug, setCaseSlug] = useState("");
  const [dials, setDials] = useState<PerspektivenDials>(DEFAULT_DIALS);

  const load = useCallback(async () => {
    try {
      const pages = await api.brain.listPages({ type: "perspektiven_session", limit: 50 });
      setSessions(pages.map((p) => p.frontmatter as unknown as PerspektivenSession));
    } catch {
      addToast({ type: "error", title: t("perspektiven.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!caseSlug) {
      addToast({ type: "error", title: t("perspektiven.err_required") });
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch("/api/legal/perspektiven-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_slug: caseSlug, dials }),
      });
      if (!res.ok) throw new Error("API error");
      const data = unwrapApiBody(await res.json());
      setSessions((prev) => [data.session, ...prev]);
      setCaseSlug("");
      addToast({ type: "success", title: t("perspektiven.ok_analyze") });
    } catch {
      addToast({ type: "error", title: t("perspektiven.err_analyze") });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("perspektiven.title")}
        description={t("perspektiven.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("perspektiven.title") },
        ]}
      />

      <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Users className="h-5 w-5" /> {t("perspektiven.new")}
        </h2>
        <div className="grid gap-3">
          <div>
            <Label>{t("perspektiven.case_slug")} *</Label>
            <Input
              value={caseSlug}
              onChange={(e) => setCaseSlug(e.target.value)}
              placeholder="legal/cases/2026-001"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>{t("perspektiven.dial_evidence")}</Label>
              <Select
                value={dials.evidenceStrength}
                onValueChange={(v) =>
                  setDials((d) => ({
                    ...d,
                    evidenceStrength: v as PerspektivenDials["evidenceStrength"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="schwach">{t("perspektiven.dial_evidence_schwach")}</SelectItem>
                  <SelectItem value="neutral">{t("perspektiven.dial_evidence_neutral")}</SelectItem>
                  <SelectItem value="stark">{t("perspektiven.dial_evidence_stark")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("perspektiven.dial_posture")}</Label>
              <Select
                value={dials.opponentPosture}
                onValueChange={(v) =>
                  setDials((d) => ({
                    ...d,
                    opponentPosture: v as PerspektivenDials["opponentPosture"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kompromissbereit">
                    {t("perspektiven.dial_posture_kompromissbereit")}
                  </SelectItem>
                  <SelectItem value="hart">{t("perspektiven.dial_posture_hart")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("perspektiven.dial_time")}</Label>
              <Select
                value={dials.timePressure}
                onValueChange={(v) =>
                  setDials((d) => ({ ...d, timePressure: v as PerspektivenDials["timePressure"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entspannt">{t("perspektiven.dial_time_entspannt")}</SelectItem>
                  <SelectItem value="eng">{t("perspektiven.dial_time_eng")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={submit} disabled={analyzing}>
            {analyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("perspektiven.analyzing")}
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" /> {t("perspektiven.submit")}
              </>
            )}
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--ds-border)] p-12 text-center text-[color:var(--ds-text-muted)]">
          <Users className="mx-auto mb-3 h-12 w-12 opacity-40" />
          <p>{t("perspektiven.empty")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sessions.map((session) => (
            <PerspektivenSessionCard key={session.id} session={session} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
