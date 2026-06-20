"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  FileText,
  Users,
  ShieldAlert,
  Landmark,
  AlertTriangle,
  Loader2,
  CalendarClock,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { caseFrontmatter } from "@/lib/legal-types";
import { cn } from "@/lib/utils";

interface PortalCase {
  slug: string;
  title: string;
  caseNumber: string;
  status: string;
  legalArea: string;
  clientName?: string;
  opponentName?: string;
  courtName?: string;
  facts: string;
  claims: string[];
  deadlines: Array<{ title?: string; date?: string; due_date?: string; status?: string }>;
  documents: Array<{ name?: string; url?: string; slug?: string; uploadedAt?: string }>;
}

interface PortalMessage {
  id: string;
  text: string;
  sender: "client" | "lawyer";
  createdAt: string;
}

interface PortalDocumentRequest {
  slug: string;
  frontmatter: {
    status: "draft" | "sent" | "partially_fulfilled" | "fulfilled" | "expired";
    items: Array<{
      key: string;
      label: string;
      required: boolean;
      received_document_slug?: string;
    }>;
  };
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: "Offen", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  pending: { label: "Anhängig", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  settled: { label: "Erledigt", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  won: { label: "Gewonnen", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  lost: { label: "Verloren", color: "text-red-400 bg-red-500/10 border-red-500/20" },
  appealed: { label: "Berufung", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  dormant: { label: "Ruhend", color: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
};

const DEADLINE_STATUS: Record<string, string> = {
  pending: "text-blue-400",
  warning: "text-amber-400",
  critical: "text-orange-400",
  overdue: "text-red-400",
  done: "text-emerald-400",
};

export default function PortalPage() {
  const params = useParams();
  const token = decodeURIComponent(params.token as string);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caseData, setCaseData] = useState<PortalCase | null>(null);
  const [loadingCase, setLoadingCase] = useState(false);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [documentRequests, setDocumentRequests] = useState<PortalDocumentRequest[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/portal/verify?token=${encodeURIComponent(token)}`);
        const verifyData = await res.json();
        if (!res.ok) {
          setError(verifyData.error === "invalid_or_expired_token" ? "Dieser Link ist abgelaufen oder ungültig. Bitte kontaktieren Sie Ihren Anwalt." : "Zugriff verweigert.");
          return;
        }
        if (!cancelled) {
          setVerifying(false);
          await loadCase();
          await loadDocumentRequests();
          await loadMessages(verifyData.caseSlug);
        }
      } catch (err) {
        console.error("[portal] verify failed:", err instanceof Error ? err.message : String(err));
        setError("Verbindungsfehler. Bitte versuchen Sie es später erneut.");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function loadMessages(caseSlug: string) {
    try {
      const res = await fetch(`/api/portal/messages?token=${encodeURIComponent(token)}&caseSlug=${encodeURIComponent(caseSlug)}`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err) {
      console.error("[portal] load messages failed:", err instanceof Error ? err.message : String(err));
    }
  }

  async function loadDocumentRequests() {
    try {
      const res = await fetch(`/api/portal/document-requests?token=${encodeURIComponent(token)}`);
      if (!res.ok) return;
      const data = await res.json();
      setDocumentRequests(data.requests || []);
    } catch (err) {
      console.error("[portal] load document requests failed:", err instanceof Error ? err.message : String(err));
    }
  }

  async function sendMessage(caseSlug: string) {
    if (!newMessage.trim()) return;
    setSendingMessage(true);
    try {
      const res = await fetch("/api/portal/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message: newMessage.trim() }),
      });
      if (res.ok) {
        setNewMessage("");
        await loadMessages(caseSlug);
      }
    } catch (err) {
      console.error("[portal] send message failed:", err instanceof Error ? err.message : String(err));
    } finally {
      setSendingMessage(false);
    }
  }

  async function loadCase() {
    setLoadingCase(true);
    try {
      const res = await fetch(`/api/portal/case?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "new_portal_link_required"
          ? "Dieser Portal-Link muss erneuert werden. Bitte kontaktieren Sie Ihre Kanzlei."
          : data.message || "Akte konnte nicht geladen werden.");
        return;
      }
      const page = data.page;
      const fm = caseFrontmatter(page);
      if (!fm.portal_enabled) {
        setError("Diese Akte ist derzeit nicht für das Mandantenportal freigegeben.");
        return;
      }
      setCaseData({
        slug: page.slug,
        title: page.title,
        caseNumber: fm.case_number || page.slug,
        status: fm.status || "open",
        legalArea: fm.legal_area || "",
        clientName: fm.client_name || undefined,
        opponentName: fm.opponent_name || undefined,
        courtName: fm.court_name || undefined,
        facts: page.content || "",
        claims: fm.claims || [],
        deadlines: (fm.deadlines || []).map((d) => ({
          title: d.title,
          date: d.date,
          due_date: d.due_date,
          status: d.status,
        })),
        documents: (fm.documents || []).map((d: { name?: string; url?: string; slug?: string; uploadedAt?: string }) => ({
          name: d.name,
          url: d.url,
          slug: d.slug,
          uploadedAt: d.uploadedAt,
        })),
      });
    } catch (err) {
      console.error("[portal] load case failed:", err instanceof Error ? err.message : String(err));
      setError("Akte konnte nicht geladen werden.");
    } finally {
      setLoadingCase(false);
    }
  }

  async function uploadDocument(file: File, requestSlug?: string, itemKey?: string) {
    if (!caseData) return;
    setUploading(true);
    setUploadingKey(itemKey ? `${requestSlug}:${itemKey}` : "general");
    setUploadError(null);
    setUploadMessage(null);
    try {
      const formData = new FormData();
      formData.append("token", token);
      formData.append("file", file);
      if (requestSlug) formData.append("document_request_slug", requestSlug);
      if (itemKey) formData.append("item_key", itemKey);
      const res = await fetch("/api/portal/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(data.message || "Upload fehlgeschlagen. Bitte versuchen Sie es erneut.");
        return;
      }
      setUploadMessage(data.documentRequestStatus === "fulfilled"
        ? "Dokument hochgeladen. Die Dokumentenanfrage ist vollständig erfüllt."
        : "Dokument hochgeladen und an die Akte übermittelt.");
      await loadCase();
      await loadDocumentRequests();
    } catch (err) {
      console.error("[portal] upload failed:", err instanceof Error ? err.message : String(err));
      setUploadError("Upload fehlgeschlagen. Bitte versuchen Sie es erneut.");
    } finally {
      setUploading(false);
      setUploadingKey(null);
    }
  }

  if (verifying || loadingCase) {
    return (
      <div className="min-h-screen bg-[#0a0a18] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 size={32} className="animate-spin text-violet-400 mx-auto" />
          <p className="text-sm text-[#8888aa]">Portal wird geladen…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a18] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <AlertTriangle size={28} className="text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-[#e8e8f0]">Zugriff nicht möglich</h1>
          <p className="text-sm text-[#8888aa]">{error}</p>
          <p className="text-xs text-[#8a8aa8]">
            Bei Fragen wenden Sie sich bitte an Ihre Kanzlei.
          </p>
        </div>
      </div>
    );
  }

  if (!caseData) return null;

  const statusCfg = STATUS_CONFIG[caseData.status] ?? STATUS_CONFIG.open;

  return (
    <div className="min-h-screen bg-[#0a0a18] text-[#e8e8f0]">
      {/* Header */}
      <header className="border-b border-[#1e1e3a] bg-[#0d0d1a]">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/15 border border-violet-500/20 flex items-center justify-center">
            <Users size={20} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Mandanten-Portal</h1>
            <p className="text-xs text-[#8888aa]">Übersicht über Ihre Akte</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Case header */}
        <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-semibold">{caseData.title}</h2>
              <p className="text-xs text-[#8a8aa8] font-mono">{caseData.caseNumber}</p>
            </div>
            <Badge variant="default" className={cn("text-[10px] border", statusCfg.color)}>
              {statusCfg.label}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8a8aa8]">
            {caseData.clientName && (
              <span className="flex items-center gap-1"><Users size={10} />Mandant: {caseData.clientName}</span>
            )}
            {caseData.opponentName && (
              <span className="flex items-center gap-1"><ShieldAlert size={10} />Gegner: {caseData.opponentName}</span>
            )}
            {caseData.courtName && (
              <span className="flex items-center gap-1"><Landmark size={10} />Gericht: {caseData.courtName}</span>
            )}
            {caseData.legalArea && (
              <span className="flex items-center gap-1"><FileText size={10} />{caseData.legalArea}</span>
            )}
          </div>
        </div>

        {/* Facts */}
        {caseData.facts && (
          <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-4">
            <h3 className="text-sm font-semibold mb-2">Sachverhalt</h3>
            <p className="text-sm text-[#8888aa] whitespace-pre-wrap leading-relaxed">{caseData.facts}</p>
          </div>
        )}

        {/* Claims */}
        {caseData.claims.length > 0 && (
          <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-4">
            <h3 className="text-sm font-semibold mb-2">Ansprüche</h3>
            <ul className="space-y-1.5">
              {caseData.claims.map((claim, i) => (
                <li key={i} className="text-sm text-[#8888aa] flex items-start gap-2">
                  <span className="text-violet-400 mt-0.5">•</span>
                  {claim}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Deadlines */}
        {caseData.deadlines.length > 0 && (
          <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-4 space-y-3">
            <h3 className="text-sm font-semibold">Fristen</h3>
            <div className="space-y-2">
              {caseData.deadlines.map((dl, i) => {
                const due = dl.due_date || dl.date || "";
                const status = dl.status || "pending";
                const statusClass = DEADLINE_STATUS[status] || "text-blue-400";
                return (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <CalendarClock size={14} className={statusClass} />
                    <div className="flex-1">
                      <div className="text-[#e8e8f0]">{dl.title || "Frist"}</div>
                      <div className="text-xs text-[#8a8aa8]">
                        {due ? new Date(due).toLocaleDateString("de-DE") : "—"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Requested documents */}
        {documentRequests.some((request) => request.frontmatter.status !== "fulfilled") && (
          <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-4 space-y-3">
            <h3 className="text-sm font-semibold">Angeforderte Unterlagen</h3>
            <div className="space-y-2">
              {documentRequests
                .filter((request) => request.frontmatter.status !== "fulfilled")
                .flatMap((request) => request.frontmatter.items.map((item) => ({ request, item })))
                .map(({ request, item }) => {
                  const done = Boolean(item.received_document_slug);
                  const key = `${request.slug}:${item.key}`;
                  return (
                    <div key={key} className="flex items-center gap-3 rounded-lg border border-[#1e1e3a] bg-[#0a0a18] px-3 py-2">
                      <FileText size={14} className={done ? "text-emerald-400" : "text-amber-400"} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-[#e8e8f0] truncate">{item.label}</div>
                        <div className="text-[11px] text-[#8a8aa8]">
                          {done ? "Eingereicht" : item.required ? "Erforderlich" : "Optional"}
                        </div>
                      </div>
                      {!done && (
                        <label className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            disabled={uploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.currentTarget.value = "";
                              if (file) void uploadDocument(file, request.slug, item.key);
                            }}
                          />
                          {uploadingKey === key ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                          Hochladen
                        </label>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Documents */}
        <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Dokumente</h3>
            <label className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer">
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = "";
                  if (file) void uploadDocument(file);
                }}
              />
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? "Lädt…" : "Hochladen"}
            </label>
          </div>
          {uploadError && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {uploadError}
            </div>
          )}
          {uploadMessage && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {uploadMessage}
            </div>
          )}
          {caseData.documents.length === 0 ? (
            <p className="text-xs text-[#8a8aa8]">Noch keine Dokumente hinterlegt.</p>
          ) : (
            <div className="space-y-2">
              {caseData.documents.map((doc, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <FileText size={14} className="text-[#8a8aa8]" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[#e8e8f0] truncate">{doc.name || "Dokument"}</div>
                    {doc.url && (doc.url.startsWith("http") || doc.url.startsWith("/")) && (
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-400 hover:underline">
                        Herunterladen →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-4 space-y-3">
          <h3 className="text-sm font-semibold">Nachrichten an Ihre Kanzlei</h3>
          {messages.length === 0 ? (
            <p className="text-xs text-[#8a8aa8]">Noch keine Nachrichten. Schreiben Sie Ihrer Kanzlei unten.</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === "client" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${msg.sender === "client" ? "bg-violet-600/15 text-violet-200 border border-violet-500/20" : "bg-[#0a0a18] text-[#8888aa] border border-[#1e1e3a]"}`}>
                    <p>{msg.text}</p>
                    <p className="text-[10px] text-[#8a8aa8] mt-1">
                      {new Date(msg.createdAt).toLocaleDateString("de-DE")} · {new Date(msg.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !sendingMessage) void sendMessage(caseData.slug); }}
              placeholder="Nachricht an Ihre Kanzlei…"
              className="flex-1 bg-[#0a0a18] border border-[#1e1e3a] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] placeholder:text-[#8a8aa8] focus:outline-none focus:border-violet-500/50"
            />
            <button
              onClick={() => void sendMessage(caseData.slug)}
              disabled={sendingMessage || !newMessage.trim()}
              className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              {sendingMessage ? "…" : "Senden"}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-[#8a8aa8] pt-6 pb-8">
          <p>Diese Ansicht ist nur für Sie bestimmt. Bitte teilen Sie den Link nicht.</p>
        </div>
      </main>
    </div>
  );
}
