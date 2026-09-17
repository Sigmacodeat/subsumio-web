"use client";

// Perspektivenraum result cards, split out of page.tsx.
//
// App Router pages may only export `default` plus the framework's config
// exports — named component exports from page.tsx fail Next.js type
// generation and therefore `next build`. These two are rendered by the page
// and asserted by perspektivenraum-grounding.test.tsx, so they live here.
//
// Grounding invariant: RoleOutputCard runs every role's text through
// useGroundedAnswer and renders CitationPanel with the "anwaltlich zu prüfen"
// badge — see CLAUDE.md.

import { useEffect } from "react";
import { Gavel, Scale, User, Landmark } from "lucide-react";
import type { TFunc } from "@/content/dashboard";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";
import {
  roleLabel,
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
