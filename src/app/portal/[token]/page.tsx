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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
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
  documents: Array<{ name?: string; url?: string; uploadedAt?: string }>;
}

interface PortalMessage {
  id: string;
  text: string;
  sender: "client" | "lawyer";
  createdAt: string;
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
          await loadCase(verifyData.caseSlug);
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

  async function loadCase(slug: string) {
    setLoadingCase(true);
    try {
      const page = await api.brain.getPage(slug);
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
        documents: (fm.documents || []).map((d: { name?: string; url?: string; uploadedAt?: string }) => ({
          name: d.name,
          url: d.url,
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

        {/* Documents */}
        {caseData.documents.length > 0 && (
          <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-4 space-y-3">
            <h3 className="text-sm font-semibold">Dokumente</h3>
            <div className="space-y-2">
              {caseData.documents.map((doc, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <FileText size={14} className="text-[#8a8aa8]" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[#e8e8f0] truncate">{doc.name || "Dokument"}</div>
                    {doc.url && (
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-400 hover:underline">
                        Herunterladen →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
