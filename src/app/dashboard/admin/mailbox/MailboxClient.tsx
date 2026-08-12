"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Mail,
  Send,
  RefreshCw,
  Reply,
  ReplyAll,
  Forward,
  PenSquare,
  X,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  Eye,
  MousePointerClick,
  CheckCircle2,
  XCircle,
  Archive,
  Trash2,
  Ban,
  MailOpen,
  Search,
  ChevronLeft,
  Settings,
  FileText,
  Code,
  Inbox as InboxIcon,
  Send as SendIcon,
  Archive as ArchiveIcon,
  Ban as SpamIcon,
  Trash2 as TrashIcon,
} from "lucide-react";
import { csrfFetch } from "@/lib/csrf";
import { useLang } from "@/lib/use-lang";
import type { Lang } from "@/content/site";

export interface MailMessageView {
  id: string;
  direction: "inbound" | "outbound";
  status: "received" | "sent" | "failed";
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  text: string | null;
  html: string | null;
  createdAt: string;
  trackingStatus?: string;
  openCount?: number;
  clickCount?: number;
  forwarded?: boolean;
  firstOpenedAt?: string | null;
  lastOpenedAt?: string | null;
  folder?: string;
  isRead?: boolean;
  snippet?: string;
}

type Folder = "inbox" | "sent" | "archive" | "spam" | "trash";

interface Props {
  initialMessages: MailMessageView[];
  initialUnreadCounts?: Record<Folder, number>;
  receivingAddress: string;
  webhookUrl: string;
  mailConfigured: boolean;
  inboundConfigured: boolean;
}

const FOLDERS: { id: Folder; label: string; icon: typeof InboxIcon }[] = [
  { id: "inbox", label: "Posteingang", icon: InboxIcon },
  { id: "sent", label: "Gesendet", icon: SendIcon },
  { id: "archive", label: "Archiv", icon: ArchiveIcon },
  { id: "spam", label: "Spam", icon: SpamIcon },
  { id: "trash", label: "Papierkorb", icon: TrashIcon },
];

const fmt = (iso: string, lang: Lang = "de") => {
  try {
    return new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "de-DE");
  } catch {
    return iso;
  }
};

const relTime = (iso: string, lang: Lang = "de") => {
  try {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diff = now - then;
    const min = Math.floor(diff / 60000);
    const hr = Math.floor(diff / 3600000);
    const day = Math.floor(diff / 86400000);
    if (lang === "en") {
      if (min < 1) return "just now";
      if (min < 60) return `${min}m ago`;
      if (hr < 24) return `${hr}h ago`;
      if (day < 7) return `${day}d ago`;
      return new Date(iso).toLocaleDateString("en-GB");
    }
    if (min < 1) return "gerade eben";
    if (min < 60) return `vor ${min} Min`;
    if (hr < 24) return `vor ${hr} Std`;
    if (day < 7) return `vor ${day} Tag${day === 1 ? "" : "en"}`;
    return new Date(iso).toLocaleDateString("de-DE");
  } catch {
    return iso;
  }
};

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function avatarColor(seed: string): string {
  const colors = [
    "bg-[color:var(--ds-category-violet-bg)] text-[color:var(--ds-category-violet-text)]",
    "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
    "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
    "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
    "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
    "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
    "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
    "bg-[color:var(--ds-category-pink-bg)] text-[color:var(--ds-category-pink-text)]",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash << 5) - hash + seed.charCodeAt(i);
  return colors[Math.abs(hash) % colors.length];
}

export default function MailboxClient({
  initialMessages,
  initialUnreadCounts,
  receivingAddress,
  webhookUrl,
  mailConfigured,
  inboundConfigured,
}: Props) {
  const { lang } = useLang();
  const [messages, setMessages] = useState<MailMessageView[]>(initialMessages);
  const [folder, setFolder] = useState<Folder>("inbox");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<Folder, number>>(
    initialUnreadCounts ?? { inbox: 0, sent: 0, archive: 0, spam: 0, trash: 0 }
  );
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyToggleRef = useRef<(() => void) | null>(null);

  const fetchMessages = useCallback(async (folderVal?: Folder, searchVal?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (folderVal) params.set("folder", folderVal);
      if (searchVal) params.set("search", searchVal);
      const res = await fetch(`/api/email/messages?${params}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        messages: MailMessageView[];
        unreadCounts?: Record<Folder, number>;
      };
      setMessages(data.messages);
      if (data.unreadCounts) setUnreadCounts(data.unreadCounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => fetchMessages(folder, search), [fetchMessages, folder, search]);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      fetchMessages(folder, search);
    }, 300);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [folder, search, fetchMessages]);

  useEffect(() => {
    if (messages.length > 0 && !messages.some((m) => m.id === selectedId)) {
      setSelectedId(messages[0].id);
    } else if (messages.length === 0) {
      setSelectedId(null);
    }
  }, [messages, selectedId]);

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) ?? null,
    [messages, selectedId]
  );

  const markAsRead = useCallback(async (id: string) => {
    try {
      await csrfFetch(`/api/email/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      });
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isRead: true } : m)));
    } catch {
      // silent fail
    }
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setMobileDetailOpen(true);
      const msg = messages.find((m) => m.id === id);
      if (msg && !msg.isRead) {
        markAsRead(id);
      }
    },
    [messages, markAsRead]
  );

  const performAction = useCallback(
    async (id: string, action: "archive" | "spam" | "trash" | "unread" | "read") => {
      const folderMap: Record<string, Folder> = {
        archive: "archive",
        spam: "spam",
        trash: "trash",
      };
      const body: Record<string, unknown> = {};
      if (action === "archive") body.folder = "archive";
      else if (action === "spam") body.folder = "spam";
      else if (action === "trash") body.folder = "trash";
      else if (action === "unread") body.isRead = false;
      else if (action === "read") body.isRead = true;

      try {
        await csrfFetch(`/api/email/messages/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== id) return m;
            const updated = { ...m };
            if (action === "archive") updated.folder = "archive";
            else if (action === "spam") updated.folder = "spam";
            else if (action === "trash") updated.folder = "trash";
            else if (action === "unread") updated.isRead = false;
            else if (action === "read") updated.isRead = true;
            return updated;
          })
        );
        const labels: Record<string, string> = {
          archive: "Archiviert",
          spam: "Als Spam markiert",
          trash: "Gelöscht",
          unread: "Als ungelesen markiert",
          read: "Als gelesen markiert",
        };
        showToast(labels[action]);
        if (folderMap[action]) {
          setTimeout(() => fetchMessages(folder, search), 100);
        }
      } catch {
        showToast("Aktion fehlgeschlagen");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folder, search, fetchMessages]
  );

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(receivingAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey) return;
      const idx = messages.findIndex((m) => m.id === selectedId);
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        if (idx < messages.length - 1) handleSelect(messages[idx + 1].id);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        if (idx > 0) handleSelect(messages[idx - 1].id);
      } else if (e.key === "e" && selectedId) {
        e.preventDefault();
        performAction(selectedId, "archive");
      } else if (e.key === "#" && selectedId) {
        e.preventDefault();
        performAction(selectedId, "trash");
      } else if (e.key === "r" && selectedId) {
        e.preventDefault();
        if (replyToggleRef.current) replyToggleRef.current();
      } else if (e.key === "u" && selectedId) {
        e.preventDefault();
        performAction(selectedId, "unread");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [messages, selectedId, handleSelect, performAction]);

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[500px] flex-col gap-0 overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] md:flex-row">
      {/* Sidebar */}
      <aside
        className="hidden w-52 shrink-0 flex-col border-r border-[color:var(--ds-border)] md:flex"
        aria-label="Ordner-Navigation"
      >
        <div className="p-3">
          <button
            onClick={() => setComposeOpen(true)}
            className="brand-bg flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <PenSquare size={14} /> Neue Mail
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {FOLDERS.map((f) => {
            const Icon = f.icon;
            const isActive = folder === f.id;
            const count = unreadCounts[f.id] ?? 0;
            return (
              <button
                key={f.id}
                onClick={() => {
                  setFolder(f.id);
                  setSearch("");
                  setMobileDetailOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "font-medium text-[color:var(--ds-text)] bg-[color:var(--ds-surface-2)]"
                    : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-surface-2)]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon size={15} />
                  {f.label}
                </span>
                {count > 0 && (
                  <span className="rounded-full bg-[color:var(--ds-category-violet-bg)] px-1.5 py-0.5 text-xs font-medium text-[color:var(--ds-category-violet-text)]">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-[color:var(--ds-border)] p-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-surface-2)]"
          >
            <Settings size={15} /> Einstellungen
          </button>
        </div>
      </aside>

      {/* Mobile folder bar */}
      <div
        className="flex w-full items-center gap-1 overflow-x-auto border-b border-[color:var(--ds-border)] p-1 md:hidden"
        aria-label="Ordner-Navigation"
      >
        {FOLDERS.map((f) => {
          const Icon = f.icon;
          const isActive = folder === f.id;
          return (
            <button
              key={f.id}
              onClick={() => {
                setFolder(f.id);
                setSearch("");
              }}
              className={`flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs ${
                isActive
                  ? "text-[color:var(--ds-text)] bg-[color:var(--ds-surface-2)]"
                  : "text-[color:var(--ds-text-muted)]"
              }`}
            >
              <Icon size={13} /> {f.label}
              {(unreadCounts[f.id] ?? 0) > 0 && (
                <span className="rounded-full bg-[color:var(--ds-category-violet-bg)] px-1 text-xs text-[color:var(--ds-category-violet-text)]">
                  {unreadCounts[f.id]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List pane */}
      <div
        className={`flex w-full flex-col md:w-[340px] md:shrink-0 md:border-r md:border-[color:var(--ds-border)] ${
          mobileDetailOpen ? "hidden md:flex" : "flex"
        }`}
        aria-label="E-Mail-Liste"
      >
        {/* Search */}
        <div className="border-b border-[color:var(--ds-border)] p-3">
          <div className="relative">
            <Search
              size={14}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen…"
              className="w-full rounded-lg border border-[color:var(--ds-border)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] bg-[color:var(--ds-surface-2)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)]"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* List header */}
        <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] px-4 py-2">
          <span className="text-xs font-semibold text-[color:var(--ds-text)]">
            {FOLDERS.find((f) => f.id === folder)?.label}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[color:var(--ds-text-subtle)]">{messages.length}</span>
            <button
              onClick={refresh}
              disabled={loading}
              className="text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)] disabled:opacity-50"
              aria-label="Aktualisieren"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && <div className="px-4 py-2 text-xs text-[color:var(--ds-danger-text)]">Fehler: {error}</div>}

        {/* Message list */}
        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-4 py-16 text-center">
            <div>
              <Mail size={28} className="mx-auto mb-2 [color:var(--ds-border-strong)]" />
              <p className="text-sm text-[color:var(--ds-text-subtle)]">
                {search ? "Keine Treffer." : "Keine E-Mails in diesem Ordner."}
              </p>
            </div>
          </div>
        ) : (
          <ul className="flex-1 divide-y divide-[color:var(--ds-border)] overflow-y-auto">
            {messages.map((m) => {
              const isSelected = m.id === selectedId;
              const isUnread = !m.isRead;
              const sender =
                m.direction === "inbound"
                  ? m.fromName || m.fromEmail
                  : m.toEmails.join(", ") || "—";
              const initials = getInitials(
                m.direction === "inbound" ? m.fromName : null,
                m.direction === "inbound" ? m.fromEmail : (m.toEmails[0] ?? "")
              );
              return (
                <li key={m.id}>
                  <button
                    onClick={() => handleSelect(m.id)}
                    className={`flex w-full gap-3 px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? "bg-[color:var(--ds-surface-2)]"
                        : "hover:bg-[color:color-mix(in_srgb,var(--ds-surface-2)_50%,transparent)]"
                    } ${isUnread ? "border-l-2 border-l-[color:var(--ds-category-violet-text)]" : "border-l-2 border-l-transparent"}`}
                  >
                    {/* Avatar */}
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${avatarColor(sender)}`}
                    >
                      {initials}
                    </div>
                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-sm ${isUnread ? "font-semibold text-[color:var(--ds-text)]" : "text-[color:var(--ds-text-muted)]"}`}
                        >
                          {sender}
                        </span>
                        <span className="shrink-0 text-xs text-[color:var(--ds-text-subtle)]">
                          {relTime(m.createdAt, lang)}
                        </span>
                      </div>
                      <p
                        className={`truncate text-sm ${isUnread ? "font-medium text-[color:var(--ds-text)]" : "text-[color:var(--ds-text-muted)]"}`}
                      >
                        {m.subject || "(kein Betreff)"}
                      </p>
                      {m.snippet && (
                        <p className="mt-0.5 truncate text-xs text-[color:var(--ds-text-subtle)]">
                          {m.snippet}
                        </p>
                      )}
                      {/* Tracking badge for outbound */}
                      {m.direction === "outbound" && m.trackingStatus && (
                        <div className="mt-1">
                          <TrackingBadge
                            status={m.trackingStatus}
                            openCount={m.openCount}
                            forwarded={m.forwarded}
                          />
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Detail pane */}
      <div className={`flex flex-1 flex-col ${mobileDetailOpen ? "flex" : "hidden md:flex"}`}>
        {selected ? (
          <MessageDetail
            message={selected}
            onSent={refresh}
            onBack={() => setMobileDetailOpen(false)}
            onAction={performAction}
            replyToggleRef={replyToggleRef}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center px-5 py-24 text-center">
            <div>
              <Mail size={32} className="mx-auto mb-3 [color:var(--ds-border-strong)]" />
              <p className="text-sm text-[color:var(--ds-text-subtle)]">Wähle links eine E-Mail aus.</p>
            </div>
          </div>
        )}
      </div>

      {/* Settings panel */}
      {showSettings && (
        <SettingsPanel
          receivingAddress={receivingAddress}
          webhookUrl={webhookUrl}
          mailConfigured={mailConfigured}
          inboundConfigured={inboundConfigured}
          copied={copied}
          onCopy={copyAddress}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Compose modal */}
      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onSent={() => {
            setComposeOpen(false);
            refresh();
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-[color:var(--ds-border-hover)] px-4 py-2.5 text-sm text-[color:var(--ds-text)] shadow-lg bg-[color:var(--ds-surface)]">
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Settings Panel ─────────────────────────────────────────────────────────

function SettingsPanel({
  receivingAddress,
  webhookUrl,
  mailConfigured,
  inboundConfigured,
  copied,
  onCopy,
  onClose,
}: {
  receivingAddress: string;
  webhookUrl: string;
  mailConfigured: boolean;
  inboundConfigured: boolean;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  // A11y: self-contained modal behavior (autofocus on open, Escape to close,
  // Tab focus trap, focus restoration on close) — this component mounts only
  // while the modal is open.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Backdrop click-to-close; keyboard users close via Escape or the close button.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mailbox-settings-title"
        className="w-full max-w-lg space-y-4 rounded-xl border border-[color:var(--ds-border)] p-5 bg-[color:var(--ds-surface)]"
      >
        <div className="flex items-center justify-between">
          <h2
            id="mailbox-settings-title"
            className="flex items-center gap-1.5 text-sm font-semibold text-[color:var(--ds-text)]"
          >
            <Settings size={15} /> Mailbox-Einstellungen
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Schließen"
            className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="mb-1 text-xs font-semibold text-[color:var(--ds-text)]">Empfangsadresse</h3>
            <p className="mb-2 text-xs text-[color:var(--ds-text-muted)]">
              Diese Adresse bei Resend (und anderen Diensten) als Konto-E-Mail verwenden.
            </p>
            <button
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border-hover)] px-3 py-2 font-mono text-sm text-[color:var(--ds-category-violet-text)] bg-[color:var(--ds-surface-2)] hover:border-[color:var(--brand-primary)] hover:text-[color:var(--ds-category-violet-text)]"
            >
              {copied ? <Check size={14} className="text-[color:var(--ds-success-text)]" /> : <Copy size={14} />}
              {receivingAddress}
            </button>
          </div>

          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <StatusPill
              ok={mailConfigured}
              okText="Versand aktiv (Resend)"
              badText="Versand nicht konfiguriert — RESEND_API_KEY fehlt"
            />
            <StatusPill
              ok={inboundConfigured}
              okText="Empfang aktiv (Resend Webhook)"
              badText="Empfang nicht konfiguriert — RESEND_WEBHOOK_SECRET fehlt"
            />
          </div>

          {!inboundConfigured && (
            <div className="space-y-1 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3 text-xs text-[color:var(--ds-warning-text)]/90">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle size={13} /> Setup:
              </p>
              <ol className="list-decimal space-y-0.5 pl-5 text-[color:var(--ds-warning-text)]">
                <li>In Resend die Domain verifizieren (MX-Records).</li>
                <li>
                  Resend → Receiving → Webhook auf{" "}
                  <span className="font-mono break-all">{webhookUrl}</span> setzen.
                </li>
                <li>
                  <span className="font-mono">RESEND_WEBHOOK_SECRET</span> in die Env eintragen.
                </li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Status Pill ────────────────────────────────────────────────────────────

function StatusPill({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
        ok
          ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
          : "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-[color:var(--ds-success-text)]" : "bg-[color:var(--ds-warning-text)]"}`} />
      <span>{ok ? okText : badText}</span>
    </div>
  );
}

// ─── Message Detail ─────────────────────────────────────────────────────────

function MessageDetail({
  message,
  onSent,
  onBack,
  onAction,
  replyToggleRef,
}: {
  message: MailMessageView;
  onSent: () => void;
  onBack: () => void;
  onAction: (id: string, action: "archive" | "spam" | "trash" | "unread" | "read") => void;
  replyToggleRef: RefObject<(() => void) | null>;
}) {
  const { lang } = useLang();
  const [replyOpen, setReplyOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"html" | "text">("html");
  const [showHeaders, setShowHeaders] = useState(false);

  useEffect(() => {
    replyToggleRef.current = () => setReplyOpen((v) => !v);
    return () => {
      replyToggleRef.current = null;
    };
  }, [replyToggleRef]);

  // Auto-detect: if no HTML, use text
  useEffect(() => {
    if (!message.html && message.text) setViewMode("text");
    else setViewMode("html");
  }, [message.id, message.html, message.text]);

  const [htmlContent, setHtmlContent] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { sanitizeHtml, plaintextToHtml } = await import("@/lib/sanitize-html");
      if (cancelled) return;
      if (viewMode === "text") {
        setHtmlContent(message.text ? plaintextToHtml(message.text) : "");
        return;
      }
      setHtmlContent(
        message.html
          ? sanitizeHtml(message.html)
          : message.text
            ? plaintextToHtml(message.text)
            : ""
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMode, message.html, message.text]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-[color:var(--ds-border)] px-3 py-2">
        <button
          onClick={onBack}
          className="mr-1 rounded-lg p-1.5 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-surface-2)] md:hidden"
          aria-label="Zurück"
        >
          <ChevronLeft size={18} />
        </button>
        {message.direction === "inbound" && (
          <>
            <ToolbarButton icon={Reply} label="Antworten" onClick={() => setReplyOpen((v) => !v)} />
            <ToolbarButton
              icon={ReplyAll}
              label="Allen antworten"
              onClick={() => setReplyOpen((v) => !v)}
            />
            <ToolbarButton
              icon={Forward}
              label="Weiterleiten"
              onClick={() => setReplyOpen((v) => !v)}
            />
          </>
        )}
        <div className="mx-1 h-4 w-px bg-[color:var(--ds-border)]" />
        <ToolbarButton
          icon={Archive}
          label="Archivieren"
          onClick={() => onAction(message.id, "archive")}
        />
        <ToolbarButton icon={Ban} label="Spam" onClick={() => onAction(message.id, "spam")} />
        <ToolbarButton
          icon={Trash2}
          label="Löschen"
          onClick={() => onAction(message.id, "trash")}
        />
        <div className="mx-1 h-4 w-px bg-[color:var(--ds-border)]" />
        <ToolbarButton
          icon={message.isRead ? Mail : MailOpen}
          label={message.isRead ? "Als ungelesen" : "Als gelesen"}
          onClick={() => onAction(message.id, message.isRead ? "unread" : "read")}
        />
        <div className="flex-1" />
        {/* HTML/Text toggle */}
        {message.html && message.text && (
          <div className="flex items-center gap-0.5 rounded-lg border border-[color:var(--ds-border)] p-0.5">
            <button
              onClick={() => setViewMode("html")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                viewMode === "html"
                  ? "text-[color:var(--ds-text)] bg-[color:var(--ds-surface-2)]"
                  : "text-[color:var(--ds-text-muted)]"
              }`}
            >
              <Code size={12} /> HTML
            </button>
            <button
              onClick={() => setViewMode("text")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                viewMode === "text"
                  ? "text-[color:var(--ds-text)] bg-[color:var(--ds-surface-2)]"
                  : "text-[color:var(--ds-text-muted)]"
              }`}
            >
              <FileText size={12} /> Text
            </button>
          </div>
        )}
      </div>

      {/* Headers */}
      <div className="border-b border-[color:var(--ds-border)] px-5 py-4">
        <h2 className="mb-2 text-base font-semibold text-[color:var(--ds-text)]">
          {message.subject || "(kein Betreff)"}
        </h2>
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium ${avatarColor(message.fromName || message.fromEmail)}`}
          >
            {getInitials(message.fromName, message.fromEmail)}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5 text-xs text-[color:var(--ds-text-muted)]">
            <p>
              <span className="font-medium text-[color:var(--ds-text)]">
                {message.fromName ? `${message.fromName}` : message.fromEmail}
              </span>
              {message.fromName && (
                <span className="text-[color:var(--ds-text-subtle)]"> &lt;{message.fromEmail}&gt;</span>
              )}
            </p>
            <p>
              <span className="text-[color:var(--ds-text-subtle)]">An:</span>{" "}
              {message.toEmails.join(", ") || "—"}
            </p>
            {message.ccEmails.length > 0 && (
              <p>
                <span className="text-[color:var(--ds-text-subtle)]">CC:</span>{" "}
                {message.ccEmails.join(", ")}
              </p>
            )}
            <p className="flex items-center gap-2">
              <span className="text-[color:var(--ds-text-subtle)]">{fmt(message.createdAt, lang)}</span>
              {message.direction === "outbound" && (
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    message.status === "failed"
                      ? "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                      : "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                  }`}
                >
                  {message.status === "failed" ? "Fehlgeschlagen" : "Gesendet"}
                </span>
              )}
              {!message.isRead && message.direction === "inbound" && (
                <span className="rounded bg-[color:var(--ds-category-violet-bg)] px-1.5 py-0.5 text-xs text-[color:var(--ds-category-violet-text)]">
                  Neu
                </span>
              )}
            </p>
            <button
              onClick={() => setShowHeaders(!showHeaders)}
              className="text-xs text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)]"
            >
              {showHeaders ? "Details ausblenden" : "Details anzeigen"}
            </button>
            {showHeaders && (
              <div className="mt-1 space-y-0.5 rounded-lg border border-[color:var(--ds-border)] p-2 font-mono text-xs text-[color:var(--ds-text-subtle)] bg-[color:var(--ds-surface-2)]">
                <p>ID: {message.id}</p>
                <p>Direction: {message.direction}</p>
                <p>Status: {message.status}</p>
                {message.trackingStatus && <p>Tracking: {message.trackingStatus}</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Email body — controlled width, scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] px-5 py-6">
          {htmlContent ? (
            <div
              className="email-content text-sm leading-relaxed text-[color:var(--ds-text-muted)]"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          ) : (
            <p className="text-sm text-[color:var(--ds-text-subtle)]">Kein Inhalt.</p>
          )}
        </div>
      </div>

      {/* Tracking timeline for outbound */}
      {message.direction === "outbound" && message.trackingStatus && (
        <TrackingTimeline
          status={message.trackingStatus}
          openCount={message.openCount}
          clickCount={message.clickCount}
          forwarded={message.forwarded}
          firstOpenedAt={message.firstOpenedAt}
          lastOpenedAt={message.lastOpenedAt}
        />
      )}

      {/* Reply form */}
      {replyOpen && (
        <ReplyForm
          messageId={message.id}
          onSent={() => {
            setReplyOpen(false);
            onSent();
          }}
          onCancel={() => setReplyOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Toolbar Button ─────────────────────────────────────────────────────────

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Reply;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-surface-2)]"
      title={label}
      aria-label={label}
    >
      <Icon size={15} />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

// ─── Reply Form ─────────────────────────────────────────────────────────────

function ReplyForm({
  messageId,
  onSent,
  onCancel,
}: {
  messageId: string;
  onSent: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    if (!text.trim()) {
      setErr("Bitte einen Text eingeben.");
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const res = await csrfFetch(`/api/email/messages/${messageId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setText("");
      onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "send_failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-[color:var(--ds-border)] px-5 py-4 bg-[color:var(--ds-surface-2)]">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Antwort schreiben…"
        autoFocus
        className="w-full rounded-lg border border-[color:var(--ds-border)] px-3 py-2 text-sm text-[color:var(--ds-text)] bg-[color:var(--ds-surface-2)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
      />
      {err && <p className="text-xs text-[color:var(--ds-danger-text)]">{err}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
        >
          Abbrechen
        </button>
        <button
          onClick={send}
          disabled={sending}
          className="brand-bg inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Senden
        </button>
      </div>
    </div>
  );
}

// ─── Compose Modal ──────────────────────────────────────────────────────────

function ComposeModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // A11y: self-contained modal behavior (autofocus on open, Escape to close,
  // Tab focus trap, focus restoration on close) — this component mounts only
  // while the modal is open.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const toInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => toInputRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const send = async () => {
    if (!to.trim() || !subject.trim() || !text.trim()) {
      setErr("Empfänger, Betreff und Text sind erforderlich.");
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const res = await csrfFetch("/api/email/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.split(",").map((s) => s.trim()), subject, text }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "send_failed");
    } finally {
      setSending(false);
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Backdrop click-to-close; keyboard users close via Escape or the close button.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mailbox-compose-title"
        className="w-full max-w-lg space-y-3 rounded-xl border border-[color:var(--ds-border)] p-5 bg-[color:var(--ds-surface)]"
      >
        <div className="flex items-center justify-between">
          <h2
            id="mailbox-compose-title"
            className="flex items-center gap-1.5 text-sm font-semibold text-[color:var(--ds-text)]"
          >
            <PenSquare size={15} /> Neue E-Mail
          </h2>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          >
            <X size={16} />
          </button>
        </div>
        <input
          ref={toInputRef}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="An (mehrere mit Komma)"
          className="w-full rounded-lg border border-[color:var(--ds-border)] px-3 py-2 text-sm text-[color:var(--ds-text)] bg-[color:var(--ds-surface-2)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
        />
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Betreff"
          className="w-full rounded-lg border border-[color:var(--ds-border)] px-3 py-2 text-sm text-[color:var(--ds-text)] bg-[color:var(--ds-surface-2)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder="Nachricht…"
          className="w-full rounded-lg border border-[color:var(--ds-border)] px-3 py-2 text-sm text-[color:var(--ds-text)] bg-[color:var(--ds-surface-2)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
        />
        {err && <p className="text-xs text-[color:var(--ds-danger-text)]">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          >
            Abbrechen
          </button>
          <button
            onClick={send}
            disabled={sending}
            className="brand-bg inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Senden
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tracking Badge ─────────────────────────────────────────────────────────

function TrackingBadge({
  status,
  openCount,
  forwarded,
}: {
  status: string;
  openCount?: number;
  forwarded?: boolean;
}) {
  const config: Record<string, { icon: typeof Eye; color: string; label: string }> = {
    sent: { icon: Send, color: "text-[color:var(--ds-text-subtle)]", label: "Gesendet" },
    delivered: { icon: CheckCircle2, color: "text-[color:var(--ds-success-text)]", label: "Zugestellt" },
    opened: { icon: Eye, color: "text-[color:var(--ds-info-text)]", label: "Geöffnet" },
    clicked: { icon: MousePointerClick, color: "text-[color:var(--ds-category-violet-text)]", label: "Geklickt" },
    bounced: { icon: XCircle, color: "text-[color:var(--ds-danger-text)]", label: "Bounce" },
    complained: { icon: AlertTriangle, color: "text-[color:var(--ds-warning-text)]", label: "Spam" },
  };
  const cfg = config[status] ?? config.sent;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cfg.color}`}>
      <Icon size={11} />
      {cfg.label}
      {openCount && openCount > 0 ? ` (${openCount}x)` : ""}
      {forwarded && (
        <span className="inline-flex items-center gap-0.5 text-[color:var(--ds-warning-text)]" title="Weitergeleitet">
          <Forward size={10} />
        </span>
      )}
    </span>
  );
}

// ─── Tracking Timeline ──────────────────────────────────────────────────────

function TrackingTimeline({
  status,
  openCount,
  clickCount,
  forwarded,
  firstOpenedAt,
  lastOpenedAt,
}: {
  status: string;
  openCount?: number;
  clickCount?: number;
  forwarded?: boolean;
  firstOpenedAt?: string | null;
  lastOpenedAt?: string | null;
}) {
  const { lang } = useLang();
  const steps: { label: string; done: boolean; icon: typeof Eye; color: string }[] = [
    { label: "Gesendet", done: true, icon: Send, color: "text-[color:var(--ds-text-subtle)]" },
    {
      label: "Zugestellt",
      done: ["delivered", "opened", "clicked"].includes(status),
      icon: CheckCircle2,
      color: "text-[color:var(--ds-success-text)]",
    },
    {
      label: "Geöffnet",
      done: ["opened", "clicked"].includes(status),
      icon: Eye,
      color: "text-[color:var(--ds-info-text)]",
    },
    {
      label: "Geklickt",
      done: status === "clicked",
      icon: MousePointerClick,
      color: "text-[color:var(--ds-category-violet-text)]",
    },
  ];
  if (status === "bounced" || status === "complained") steps.length = 0;

  return (
    <div className="border-t border-[color:var(--ds-border)] px-5 py-4 bg-[color:var(--ds-surface-2)]">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-semibold text-[color:var(--ds-text)]">Tracking</h3>
        {status === "bounced" && (
          <span className="inline-flex items-center gap-1 rounded bg-[color:var(--ds-danger-bg)] px-2 py-0.5 text-xs text-[color:var(--ds-danger-text)]">
            <XCircle size={11} /> Email gebounct
          </span>
        )}
        {status === "complained" && (
          <span className="inline-flex items-center gap-1 rounded bg-[color:var(--ds-warning-bg)] px-2 py-0.5 text-xs text-[color:var(--ds-warning-text)]">
            <AlertTriangle size={11} /> Spam-Beschwerde
          </span>
        )}
        {forwarded && (
          <span className="inline-flex items-center gap-1 rounded bg-[color:var(--ds-warning-bg)] px-2 py-0.5 text-xs text-[color:var(--ds-warning-text)]">
            <Forward size={11} /> Weitergeleitet
          </span>
        )}
      </div>
      {steps.length > 0 ? (
        <div className="flex items-center gap-1">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="flex items-center gap-1">
                <div
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${
                    step.done ? step.color : "text-[color:var(--ds-text-subtle)] opacity-50"
                  }`}
                >
                  <Icon size={12} />
                  {step.label}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`h-px w-4 ${step.done ? "bg-[color:var(--brand-primary)]" : "bg-[color:var(--ds-border)]"}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="mt-3 grid gap-1 text-xs text-[color:var(--ds-text-muted)]">
        {openCount !== undefined && openCount > 0 && (
          <div className="flex items-center gap-1.5">
            <Eye size={11} className="text-[color:var(--ds-info-text)]" />
            <span>{openCount}x geöffnet</span>
            {firstOpenedAt && (
              <span className="text-[color:var(--ds-text-subtle)]">
                — zuerst {fmt(firstOpenedAt, lang)}
              </span>
            )}
            {lastOpenedAt && lastOpenedAt !== firstOpenedAt && (
              <span className="text-[color:var(--ds-text-subtle)]">
                — zuletzt {fmt(lastOpenedAt, lang)}
              </span>
            )}
          </div>
        )}
        {clickCount !== undefined && clickCount > 0 && (
          <div className="flex items-center gap-1.5">
            <MousePointerClick size={11} className="text-[color:var(--ds-category-violet-text)]" />
            <span>{clickCount}x geklickt</span>
          </div>
        )}
        {openCount === 0 && clickCount === 0 && status !== "bounced" && status !== "complained" && (
          <p className="text-[color:var(--ds-text-subtle)]">Noch keine Interaktion erfasst.</p>
        )}
      </div>
    </div>
  );
}
