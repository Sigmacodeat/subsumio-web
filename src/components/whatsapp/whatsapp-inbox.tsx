"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { MessageSquare, Send, ArrowLeft, Phone, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { useLang } from "@/lib/use-lang";
import { useToast } from "@/components/ui/toast";
import type { DashboardKey } from "@/content/dashboard";

interface ChatMessage {
  slug: string;
  direction: "inbound" | "outbound";
  content: string;
  timestamp: string;
  senderName?: string;
  messageType: string;
  status?: string;
  intent?: string;
}

interface Conversation {
  senderHash: string;
  senderName: string;
  messages: ChatMessage[];
  lastAt: string;
  unreadCount: number;
}

function fm(page: BrainPage): Record<string, unknown> {
  return (page.frontmatter ?? {}) as Record<string, unknown>;
}

function str(val: unknown): string {
  return typeof val === "string" ? val : "";
}

function deliveryLabel(status: string | undefined): string | null {
  if (!status) return null;
  const labels: Record<string, string> = {
    submitted: "Übermittelt",
    sent: "Gesendet",
    delivered: "Zugestellt",
    read: "Gelesen",
    failed: "Fehlgeschlagen",
  };
  return labels[status] ?? status;
}

export function WhatsAppInbox() {
  const { t } = useLang();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [inbound, outbound] = await Promise.all([
        api.brain.listPages({ type: "chat_inbox", limit: 200 }),
        api.brain.listPages({ type: "chat_outbox", limit: 200 }),
      ]);

      const allMessages: ChatMessage[] = [
        ...inbound.map((p) => ({
          slug: p.slug,
          direction: "inbound" as const,
          content: p.content || "",
          timestamp: str(fm(p).received_at) || p.created_at || "",
          senderName: str(fm(p).from_name),
          messageType: str(fm(p).message_type) || "text",
          status: str(fm(p).status),
          intent: str(fm(p).intent),
        })),
        ...outbound.map((p) => ({
          slug: p.slug,
          direction: "outbound" as const,
          content: p.content || "",
          timestamp: str(fm(p).sent_at) || str(fm(p).status_timestamp) || p.created_at || "",
          messageType: str(fm(p).message_type) || "text",
          status: str(fm(p).status),
          intent: str(fm(p).intent),
        })),
      ];

      // Group by sender hash
      const map = new Map<string, Conversation>();
      for (const msg of allMessages) {
        const page =
          msg.direction === "inbound"
            ? inbound.find((p) => p.slug === msg.slug)
            : outbound.find((p) => p.slug === msg.slug);
        const senderHash =
          msg.direction === "inbound"
            ? str(fm(page!).from_phone_hash)
            : str(fm(page!).to_phone_hash);

        if (!senderHash) continue;

        const existing = map.get(senderHash);
        if (existing) {
          existing.messages.push(msg);
          if (new Date(msg.timestamp) > new Date(existing.lastAt)) {
            existing.lastAt = msg.timestamp;
          }
        } else {
          map.set(senderHash, {
            senderHash,
            senderName: msg.senderName || `****${senderHash.slice(-4)}`,
            messages: [msg],
            lastAt: msg.timestamp,
            unreadCount: 0,
          });
        }
      }

      // Sort messages within each conversation by timestamp
      for (const conv of map.values()) {
        conv.messages.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      }

      const sorted = Array.from(map.values()).sort(
        (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
      );

      setConversations(sorted);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Nachrichten konnten nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMessages();
    const interval = window.setInterval(() => void loadMessages(), 30_000);
    return () => window.clearInterval(interval);
  }, [loadMessages]);

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) =>
        c.senderName.toLowerCase().includes(q) ||
        c.senderHash.includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [conversations, search]);

  const selectedConversation = selectedHash
    ? conversations.find((c) => c.senderHash === selectedHash)
    : null;

  const handleSendReply = useCallback(async () => {
    if (!replyText.trim() || !selectedConversation) return;
    setSending(true);
    try {
      const message = replyText.trim().slice(0, 3900);
      const result = await api.whatsapp.sendReply(selectedConversation.senderHash, message);
      await api.brain.createPage({
        slug: `legal/chat/whatsapp-outbox/${result.messageId || `manual-${Date.now()}`}`,
        title: "WhatsApp-Antwort manuell",
        type: "chat_outbox",
        content: message,
        frontmatter: {
          type: "chat_outbox",
          provider: "whatsapp",
          to_phone_hash: selectedConversation.senderHash,
          message_id: result.messageId,
          direction: "outbound",
          message_type: "text",
          sent_at: new Date().toISOString(),
          status: "submitted",
          intent: "manual_reply",
        },
      });

      setReplyText("");
      addToast({ type: "success", title: "WhatsApp-Nachricht versendet" });
      await loadMessages();
    } catch (error) {
      addToast({
        type: "error",
        title: "WhatsApp-Nachricht konnte nicht versendet werden",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSending(false);
    }
  }, [addToast, replyText, selectedConversation, loadMessages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
        <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-12 text-center"
        role="alert"
      >
        <p className="text-sm text-[color:var(--ds-danger-text)]">{loadError}</p>
        <Button variant="outline" onClick={() => void loadMessages()}>
          {t("common.retry" as DashboardKey)}
        </Button>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MessageSquare size={32} className="mb-2 text-[color:var(--ds-text-muted)]" />
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          {t("whatsapp.inbox_empty" as DashboardKey)}
        </p>
      </div>
    );
  }

  // Conversation thread view
  if (selectedConversation) {
    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[color:var(--ds-border)] px-4 py-3">
          <button
            onClick={() => setSelectedHash(null)}
            className="text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--ds-surface-2)] text-xs font-medium text-[color:var(--ds-text)]">
            {selectedConversation.senderName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
              {selectedConversation.senderName}
            </div>
            <div className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
              <Phone size={10} />
              ****{selectedConversation.senderHash.slice(-4)}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {selectedConversation.messages.map((msg) => (
            <div
              key={msg.slug}
              className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                  msg.direction === "outbound"
                    ? "bg-blue-600 text-white"
                    : "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                }`}
              >
                <p className="break-words whitespace-pre-wrap">{msg.content}</p>
                <div
                  className={`mt-1 flex items-center gap-1 text-xs ${
                    msg.direction === "outbound"
                      ? "text-blue-200"
                      : "text-[color:var(--ds-text-muted)]"
                  }`}
                >
                  <span>
                    {new Date(msg.timestamp).toLocaleString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                  {msg.status && msg.direction === "outbound" && (
                    <Badge
                      variant="default"
                      className={
                        msg.status === "failed"
                          ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-xs text-[color:var(--ds-danger-text)]"
                          : "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-xs text-[color:var(--ds-info-text)]"
                      }
                    >
                      {deliveryLabel(msg.status)}
                    </Badge>
                  )}
                  {msg.intent && msg.intent !== "manual_reply" && (
                    <Badge variant="default" className="text-xs opacity-70">
                      {msg.intent}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Reply input */}
        <div className="border-t border-[color:var(--ds-border)] p-3">
          <div className="flex gap-2">
            <Input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={t("whatsapp.reply_placeholder" as DashboardKey)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendReply();
                }
              }}
              className="flex-1"
            />
            <Button
              onClick={handleSendReply}
              disabled={!replyText.trim() || sending}
              className="gap-2"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Conversation list view
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={16}
          className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("whatsapp.search_conversations" as DashboardKey)}
          className="pl-9"
        />
      </div>

      <div className="divide-y divide-[color:var(--ds-border)] rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
        {filteredConversations.map((conv) => {
          const lastMsg = conv.messages[conv.messages.length - 1];
          return (
            <button
              key={conv.senderHash}
              onClick={() => setSelectedHash(conv.senderHash)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--ds-surface-2)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--ds-surface-2)] text-sm font-medium text-[color:var(--ds-text)]">
                {conv.senderName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                    {conv.senderName}
                  </span>
                  <span className="shrink-0 text-xs text-[color:var(--ds-text-muted)]">
                    {new Date(conv.lastAt).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                </div>
                <p className="truncate text-xs text-[color:var(--ds-text-muted)]">
                  {lastMsg?.direction === "outbound" ? "→ " : ""}
                  {lastMsg?.content || ""}
                </p>
              </div>
              <Badge variant="default" className="shrink-0 text-xs">
                {conv.messages.length}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
