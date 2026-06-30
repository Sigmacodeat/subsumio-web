"use client";

import { useState, useCallback } from "react";
import {
  Sparkles,
  Scale,
  CalendarClock,
  FileText,
  Lightbulb,
  ClipboardList,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { ChatPanel } from "@/components/chat/chat-panel";

interface QuickAction {
  key: string;
  icon: typeof Sparkles;
  labelDe: string;
  labelEn: string;
  queryDe: string;
  queryEn: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    key: "strategy",
    icon: Lightbulb,
    labelDe: "Strategie empfehlen",
    labelEn: "Recommend strategy",
    queryDe: "Welche Strategie empfiehlst du für diese Akte?",
    queryEn: "What strategy do you recommend for this case?",
  },
  {
    key: "chances",
    icon: Scale,
    labelDe: "Prozessaussichten bewerten",
    labelEn: "Assess chances",
    queryDe: "Wie stehen die Prozessaussichten in dieser Akte?",
    queryEn: "What are the chances of success in this case?",
  },
  {
    key: "timeline",
    icon: CalendarClock,
    labelDe: "Timeline generieren",
    labelEn: "Generate timeline",
    queryDe: "Erstelle eine Timeline der wichtigsten Ereignisse dieser Akte.",
    queryEn: "Create a timeline of the key events in this case.",
  },
  {
    key: "summary",
    icon: FileText,
    labelDe: "Aktenzusammenfassung",
    labelEn: "Case summary",
    queryDe: "Fasse diese Akte prägnant zusammen.",
    queryEn: "Summarize this case concisely.",
  },
  {
    key: "contradictions",
    icon: AlertCircle,
    labelDe: "Widersprüche finden",
    labelEn: "Find contradictions",
    queryDe: "Gibt es Widersprüche in den Aussagen oder Dokumenten dieser Akte?",
    queryEn: "Are there contradictions in the statements or documents of this case?",
  },
  {
    key: "deadlines",
    icon: ClipboardList,
    labelDe: "Fristen prüfen",
    labelEn: "Check deadlines",
    queryDe: "Welche Fristen sind in dieser Akte aktuell und welche drohen zu verstreichen?",
    queryEn: "Which deadlines are current in this case and which are at risk?",
  },
];

export function AiTab() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();
  const [initialQuery, setInitialQuery] = useState<string | undefined>(undefined);
  const [queryNonce, setQueryNonce] = useState(0);

  const handleQuickAction = useCallback((action: QuickAction) => {
    const query = lang === "en" ? action.queryEn : action.queryDe;
    setInitialQuery(query);
    setQueryNonce((n) => n + 1);
  }, [lang]);

  if (!ctx.caseData) return null;
  const caseData = ctx.caseData;
  const isArchived = caseData.status === "archived";

  return (
    <div className="flex h-full flex-col">
      {/* Quick Actions Bar */}
      <div className="border-b border-[color:var(--ds-border)] px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--ds-text-muted)]">
            <Sparkles size={12} className="text-blue-600" />
            {lang === "en" ? "Quick actions:" : "Schnellaktionen:"}
          </div>
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.key}
                variant="ghost"
                size="sm"
                disabled={isArchived}
                onClick={() => handleQuickAction(action)}
                className="gap-1.5 text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              >
                <Icon size={12} />
                {lang === "en" ? action.labelEn : action.labelDe}
              </Button>
            );
          })}
        </div>
        {isArchived && (
          <p className="mt-2 text-xs text-amber-600">
            {lang === "en"
              ? "AI features are disabled for archived cases."
              : "KI-Funktionen sind für archivierte Akten deaktiviert."}
          </p>
        )}
      </div>

      {/* Chat Panel */}
      <div className="flex flex-1 flex-col overflow-hidden p-4 md:p-6">
        <ChatPanel
          key={queryNonce}
          context={{ type: "case", caseSlug: caseData.slug }}
          initialQuery={initialQuery}
          persistHistory
          className="flex-1"
          placeholder={
            lang === "en"
              ? "Ask the AI about this case…"
              : "Frage die KI zu dieser Akte…"
          }
        />
      </div>
    </div>
  );
}
