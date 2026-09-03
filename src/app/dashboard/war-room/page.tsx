"use client";

// Perspektivenraum — grounded multi-role adversarial reasoning.
// Richter/Gegenanwalt/Mandant (+ Geschworene/Schöffen where the case type
// actually has one) each read the same matter record. No numeric win
// probabilities or settlement ranges — every role's text is grounded via
// useGroundedAnswer + CitationPanel like the rest of the litigation surfaces
// (process-strategy, red-team), with the "anwaltlich zu prüfen" badge on by
// default. See lib/perspektivenraum-agent.ts for the prompt/parsing layer.

import { useEffect, useState, useCallback } from "react";
import { Loader2, Users, Send, Gavel, Scale, User, Landmark } from "lucide-react";
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
import type { TFunc } from "@/content/dashboard";
import { api } from "@/lib/api";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";
import {
  DEFAULT_DIALS,
  roleLabel,
  type PerspektivenDials,
  type PerspektivenRole,
  type PerspektivenRoleOutput,
  type PerspektivenSession,
} from "@/lib/perspektivenraum-agent";

const ROLE_ICONS: Record<PerspektivenRole, typeof Gavel> = {
  richter: Gavel,
  gegenanwalt: Scale,
  mandant: User,
  geschworene: Landmark,
};

// Explicit literal keys (not a template literal) so TFunc's key union stays
// exhaustive-checkable — see src/content/dashboard.ts's `perspektiven.role.*` entries.
const ROLE_LABEL_KEYS: Record<PerspektivenRole, Parameters<TFunc>[0]> = {
  richter: "perspektiven.role.richter",
  gegenanwalt: "perspektiven.role.gegenanwalt",
  mandant: "perspektiven.role.mandant",
  geschworene: "perspektiven.role.geschworene",
};

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
      const data = await res.json();
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

export function PerspektivenSessionCard({
  session,
  t,
}: {
  session: PerspektivenSession;
  t: TFunc;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{session.case_slug}</span>
        <span className="text-xs text-[color:var(--ds-text-muted)]">
          {new Date(session.created_at).toLocaleString("de-DE")}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {session.roles.map((output) => (
          <RoleOutputCard key={output.role} output={output} t={t} />
        ))}
      </div>
    </div>
  );
}

export function RoleOutputCard({ output, t }: { output: PerspektivenRoleOutput; t: TFunc }) {
  const { grounding, isGrounding, groundAnswer } = useGroundedAnswer();
  const Icon = ROLE_ICONS[output.role];

  useEffect(() => {
    const groundingText = [output.headline, output.analysis, ...output.key_points].join("\n\n");
    groundAnswer(groundingText).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [output.headline]);

  return (
    <div className="space-y-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[color:var(--ds-text-muted)]" />
        <span className="text-xs font-semibold tracking-wide [color:var(--ds-text-muted)] uppercase">
          {t(ROLE_LABEL_KEYS[output.role]) || roleLabel(output.role)}
        </span>
      </div>
      <p className="text-sm font-medium">{output.headline}</p>
      <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">{output.analysis}</p>
      {output.key_points.length > 0 && (
        <ul className="space-y-1 text-xs text-[color:var(--ds-text-muted)]">
          {output.key_points.map((point, i) => (
            <li key={i} className="flex gap-1.5">
              <span aria-hidden>—</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}
      <CitationPanel
        data={
          {
            grounding: grounding ?? null,
            citations: [],
            isStreaming: isGrounding,
          } satisfies CitationPanelData
        }
        compact
      />
    </div>
  );
}
