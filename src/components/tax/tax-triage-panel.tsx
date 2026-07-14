"use client";

import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import {
  Inbox,
  Loader2,
  AlertTriangle,
  Plus,
  Trash2,
  ChevronDown,
  Calendar,
  FileText,
  Euro,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TriageResult {
  card: {
    id: string;
    source: string;
    urgency: string;
    actionType: string;
    title: string;
    summary: string;
    legalArea?: string;
    deadline?: string;
    confidence: string;
    status: string;
  };
  enrichment: {
    document_type: string;
    tax_area: string;
    deadline_type: string | null;
    deadline_date: string | null;
    deadline_legal_basis: string | null;
    required_actions: string[];
    risk_level: string;
    estimated_amount: number | null;
    jurisdiction: string;
    key_entities: { label: string; value: string }[];
  } | null;
  ai_classified: boolean;
}

interface TriageSummary {
  total: number;
  tax_related: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  ai_enriched: number;
}

interface MessageInput {
  source: "bea" | "email" | "scan" | "whatsapp" | "portal" | "manual";
  subject: string;
  body: string;
  sender: string;
}

const URGENCY_STYLES: Record<string, { color: string; icon: typeof AlertCircle }> = {
  critical: { color: "text-red-600 bg-red-500/10 border-red-500/20", icon: AlertCircle },
  high: { color: "text-orange-600 bg-orange-500/10 border-orange-500/20", icon: AlertTriangle },
  medium: { color: "text-amber-600 bg-amber-500/10 border-amber-500/20", icon: AlertTriangle },
  low: { color: "text-slate-600 bg-slate-500/10 border-slate-500/20", icon: CheckCircle2 },
};

const SOURCE_LABELS: Record<string, string> = {
  bea: "beA",
  email: "E-Mail",
  scan: "Scan",
  whatsapp: "WhatsApp",
  portal: "Portal",
  manual: "Manuell",
};

const RISK_STYLES: Record<string, string> = {
  critical: "text-red-600 bg-red-500/10 border-red-500/20",
  high: "text-orange-600 bg-orange-500/10 border-orange-500/20",
  medium: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  low: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
};

export function TaxTriagePanel() {
  const { t } = useLang();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TriageResult[] | null>(null);
  const [summary, setSummary] = useState<TriageSummary | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [jurisdiction, setJurisdiction] = useState<"de" | "at" | "ch">("de");
  const [useAi, setUseAi] = useState(true);
  const [messages, setMessages] = useState<MessageInput[]>([
    { source: "email", subject: "", body: "", sender: "" },
  ]);

  const addMessage = useCallback(() => {
    setMessages((prev) => [...prev, { source: "email", subject: "", body: "", sender: "" }]);
  }, []);

  const removeMessage = useCallback((idx: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateMessage = useCallback((idx: number, field: keyof MessageInput, value: string) => {
    setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)));
  }, []);

  async function analyze() {
    const validMessages = messages.filter((m) => m.subject.trim().length > 0);
    if (validMessages.length === 0) {
      addToast({ title: t("tax.triage.error"), type: "error" });
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);
    setSummary(null);

    try {
      const res = await api.tax.triage({
        messages: validMessages.map((m) => ({
          source: m.source,
          subject: m.subject,
          body: m.body || undefined,
          sender: m.sender || undefined,
        })),
        jurisdiction,
        useAi,
      });
      setResults(res.results);
      setSummary(res.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Triage failed");
      addToast({ title: t("tax.triage.error"), type: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-[color:var(--ds-text-muted)]" />
            <h3 className="text-lg font-semibold">{t("tax.triage.title")}</h3>
          </div>
          <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">{t("tax.triage.desc")}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">
              {t("tax.triage.jurisdiction")}
            </Label>
            <Select value={jurisdiction} onValueChange={(v) => setJurisdiction(v as "de" | "at" | "ch")}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="de">DE</SelectItem>
                <SelectItem value="at">AT</SelectItem>
                <SelectItem value="ch">CH</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">
              {t("tax.triage.use_ai")}
            </Label>
            <Switch checked={useAi} onCheckedChange={setUseAi} />
          </div>
        </div>
      </div>

      {/* Message inputs */}
      <div className="space-y-3">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-1)] p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <Select
                value={msg.source}
                onValueChange={(v) => updateMessage(idx, "source", v)}
              >
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder={t("tax.triage.subject")}
                value={msg.subject}
                onChange={(e) => updateMessage(idx, "subject", e.target.value)}
                className="flex-1 h-8 text-sm"
              />
              {messages.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => removeMessage(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Absender (optional)"
                value={msg.sender}
                onChange={(e) => updateMessage(idx, "sender", e.target.value)}
                className="w-48 h-8 text-xs"
              />
              <Textarea
                placeholder={t("tax.triage.body")}
                value={msg.body}
                onChange={(e) => updateMessage(idx, "body", e.target.value)}
                className="flex-1 min-h-[60px] text-sm resize-y"
              />
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addMessage} className="text-xs">
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t("tax.triage.add_message")}
        </Button>
      </div>

      <Button onClick={analyze} disabled={loading} className="w-full">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {t("tax.triage.analyzing")}
          </>
        ) : (
          <>
            <Inbox className="h-4 w-4 mr-2" />
            {t("tax.triage.analyze")}
          </>
        )}
      </Button>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-center">
            <div className="text-lg font-bold text-red-600">{summary.critical}</div>
            <div className="text-xs text-[color:var(--ds-text-muted)]">{t("tax.triage.critical")}</div>
          </div>
          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-2 text-center">
            <div className="text-lg font-bold text-orange-600">{summary.high}</div>
            <div className="text-xs text-[color:var(--ds-text-muted)]">{t("tax.triage.high")}</div>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-center">
            <div className="text-lg font-bold text-amber-600">{summary.medium}</div>
            <div className="text-xs text-[color:var(--ds-text-muted)]">{t("tax.triage.medium")}</div>
          </div>
          <div className="rounded-lg border border-slate-500/20 bg-slate-500/5 p-2 text-center">
            <div className="text-lg font-bold text-slate-600">{summary.low}</div>
            <div className="text-xs text-[color:var(--ds-text-muted)]">{t("tax.triage.low")}</div>
          </div>
        </div>
      )}

      {/* Results */}
      {results && results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, idx) => {
            const UrgencyIcon = URGENCY_STYLES[r.card.urgency]?.icon ?? CheckCircle2;
            const urgencyStyle = URGENCY_STYLES[r.card.urgency]?.color ?? URGENCY_STYLES.low.color;
            const isExpanded = expandedIdx === idx;

            return (
              <div
                key={r.card.id}
                className={cn(
                  "rounded-lg border p-3 transition-all",
                  urgencyStyle
                )}
              >
                <div
                  className="flex items-start justify-between gap-2 cursor-pointer"
                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                >
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <UrgencyIcon className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="default" className="text-xs">
                          {SOURCE_LABELS[r.card.source] ?? r.card.source}
                        </Badge>
                        <Badge variant="default" className="text-xs capitalize">
                          {r.card.actionType}
                        </Badge>
                        {r.ai_classified && (
                          <Badge variant="default" className="text-xs text-blue-600">
                            {t("tax.triage.ai_enriched")}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium truncate">{r.card.title}</p>
                      <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)] line-clamp-2">
                        {r.card.summary}
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-[color:var(--ds-text-muted)] transition-transform",
                      isExpanded && "rotate-180"
                    )}
                  />
                </div>

                {isExpanded && (
                  <div className="mt-3 space-y-3 border-t border-[color:var(--ds-border)] pt-3">
                    {/* Basic triage info */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {r.card.legalArea && (
                        <div>
                          <span className="text-[color:var(--ds-text-muted)]">
                            {t("tax.triage.legal_area")}:
                          </span>{" "}
                          <span className="font-medium">{r.card.legalArea}</span>
                        </div>
                      )}
                      {r.card.deadline && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span className="text-[color:var(--ds-text-muted)]">
                            {t("tax.triage.deadline")}:
                          </span>
                          <span className="font-medium">{r.card.deadline}</span>
                        </div>
                      )}
                    </div>

                    {/* AI enrichment */}
                    {r.enrichment && (
                      <div className="space-y-2 rounded-md bg-[color:var(--ds-surface-2)] p-2 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[color:var(--ds-text-muted)]">
                              {t("tax.triage.doc_type")}:
                            </span>{" "}
                            <span className="font-medium">{r.enrichment.document_type}</span>
                          </div>
                          <div>
                            <span className="text-[color:var(--ds-text-muted)]">
                              {t("tax.triage.tax_area")}:
                            </span>{" "}
                            <span className="font-medium">{r.enrichment.tax_area}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[color:var(--ds-text-muted)]">
                            {t("tax.triage.risk_level")}:
                          </span>
                          <Badge
                            variant="default"
                            className={cn("text-xs", RISK_STYLES[r.enrichment.risk_level])}
                          >
                            {r.enrichment.risk_level}
                          </Badge>
                        </div>

                        {r.enrichment.deadline_date && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span className="font-medium">{r.enrichment.deadline_date}</span>
                            {r.enrichment.deadline_legal_basis && (
                              <span className="text-[color:var(--ds-text-muted)]">
                                ({r.enrichment.deadline_legal_basis})
                              </span>
                            )}
                          </div>
                        )}

                        {r.enrichment.estimated_amount !== null && (
                          <div className="flex items-center gap-1">
                            <Euro className="h-3 w-3" />
                            <span className="font-medium">
                              {r.enrichment.estimated_amount.toLocaleString("de-DE")} €
                            </span>
                          </div>
                        )}

                        {r.enrichment.required_actions.length > 0 && (
                          <div>
                            <div className="text-[color:var(--ds-text-muted)] mb-1">
                              {t("tax.triage.required_actions")}:
                            </div>
                            <ul className="list-disc list-inside space-y-0.5">
                              {r.enrichment.required_actions.map((action, i) => (
                                <li key={i}>{action}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {r.enrichment.key_entities.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {r.enrichment.key_entities.map((e, i) => (
                              <Badge key={i} variant="default" className="text-xs">
                                {e.label}: {e.value}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!results && !loading && !error && (
        <div className="text-center py-8 text-sm text-[color:var(--ds-text-muted)]">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          {t("tax.triage.empty")}
        </div>
      )}
    </Card>
  );
}
