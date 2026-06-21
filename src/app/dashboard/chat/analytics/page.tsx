"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Zap, Pin, Tag, TrendingUp, Calendar, Hash, Cpu, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getChatStats } from "@/components/chat/chat-session-store";
import { AI_MODELS } from "@/lib/model-config";

interface ChatStats {
  totalSessions: number;
  totalMessages: number;
  totalTokens: number;
  pinnedCount: number;
  taggedCount: number;
  tokensByDay: Array<{ date: string; tokens: number }>;
}

export default function ChatAnalyticsPage() {
  const [stats, setStats] = useState<ChatStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getChatStats().then((s) => {
      setStats(s);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--ds-border)] border-t-[color:var(--brand-primary)]" />
      </div>
    );
  }

  if (!stats || stats.totalSessions === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <MessageSquare size={40} className="mb-4 text-[color:var(--ds-text-subtle)]" />
        <h2 className="text-lg font-semibold text-[color:var(--ds-text)]">Chat Analytics</h2>
        <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
          Noch keine Chat-Daten vorhanden. Starte eine Konversation im Brain-Chat, um Statistiken zu
          sehen.
        </p>
      </div>
    );
  }

  const maxTokens = Math.max(...stats.tokensByDay.map((d) => d.tokens), 1);
  const avgTokensPerMessage =
    stats.totalMessages > 0 ? Math.round(stats.totalTokens / stats.totalMessages) : 0;

  const cards = [
    {
      icon: MessageSquare,
      label: "Konversationen",
      value: stats.totalSessions,
      color: "text-blue-500",
    },
    {
      icon: Hash,
      label: "Nachrichten",
      value: stats.totalMessages,
      color: "text-emerald-500",
    },
    {
      icon: Zap,
      label: "Tokens gesamt",
      value: stats.totalTokens.toLocaleString("de-DE"),
      color: "text-amber-500",
    },
    {
      icon: TrendingUp,
      label: "Ø Tokens/Nachricht",
      value: avgTokensPerMessage.toLocaleString("de-DE"),
      color: "text-purple-500",
    },
    {
      icon: Pin,
      label: "Angeheftet",
      value: stats.pinnedCount,
      color: "text-rose-500",
    },
    {
      icon: Tag,
      label: "Getaggt",
      value: stats.taggedCount,
      color: "text-cyan-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[color:var(--ds-text)]">Chat Analytics</h1>
        <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
          Statistiken über alle Chat-Konversationen und Token-Verbräuche.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <div className="flex items-center gap-2">
                <Icon size={16} className={card.color} />
                <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {card.label}
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-[color:var(--ds-text)]">{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Token usage chart */}
      {stats.tokensByDay.length > 0 && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6">
          <div className="mb-4 flex items-center gap-2">
            <Calendar size={16} className="text-[color:var(--ds-text-muted)]" />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              Token-Verbrauch über Zeit
            </h2>
          </div>
          <div className="flex items-end gap-1.5" style={{ height: "200px" }}>
            {stats.tokensByDay.slice(-30).map((day) => (
              <div
                key={day.date}
                className="group relative flex flex-1 flex-col items-center justify-end"
                style={{ height: "100%" }}
              >
                <div
                  className="brand-bg w-full rounded-t transition-all hover:opacity-80"
                  style={{
                    height: `${(day.tokens / maxTokens) * 100}%`,
                    minHeight: day.tokens > 0 ? "4px" : "0",
                  }}
                  title={`${day.date}: ${day.tokens.toLocaleString("de-DE")} Tokens`}
                />
                <div className="absolute -top-8 z-10 hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs whitespace-nowrap text-[color:var(--ds-text)] shadow-lg group-hover:block">
                  {day.tokens.toLocaleString("de-DE")} Tokens
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-[color:var(--ds-text-subtle)]">
            <span>{stats.tokensByDay[0]?.date}</span>
            <span>{stats.tokensByDay[stats.tokensByDay.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Model catalog reference */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6">
        <div className="mb-4 flex items-center gap-2">
          <Cpu size={16} className="text-[color:var(--ds-text-muted)]" />
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Verfügbare Modelle</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AI_MODELS.slice(0, 6).map((model) => (
            <div
              key={model.id}
              className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[color:var(--ds-text)]">
                  {model.name}
                </span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    model.speedRating >= 4
                      ? "bg-emerald-500/10 text-emerald-600"
                      : model.speedRating >= 3
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-red-500/10 text-red-600"
                  )}
                >
                  Speed: {model.speedRating}/5
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-[color:var(--ds-text-subtle)]">
                <span className="inline-flex items-center gap-1">
                  <Clock size={10} />
                  {model.contextWindow.toLocaleString("de-DE")} ctx
                </span>
                <span className="inline-flex items-center gap-1">
                  <Zap size={10} />${(model.costPer1MInput + model.costPer1MOutput).toFixed(1)}/1M
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
