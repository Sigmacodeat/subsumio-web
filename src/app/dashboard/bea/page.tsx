"use client";

import { useEffect, useState } from "react";
import {
  Save,
  FileText,
  Info,
  Loader2,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { AI_BADGE_LABEL, AI_FRONTMATTER } from "@/lib/ai-act";
import { PageHeader } from "@/components/dashboard/page-header";

interface BeaDraft {
  slug: string;
  subject: string;
  recipient: string;
  caseNumber?: string;
  createdAt: string;
  aiGenerated?: boolean;
}

interface BeaImported {
  slug: string;
  subject: string;
  sender: string;
  sentDate: string;
}

export default function BeaPage() {
  const [drafts, setDrafts] = useState<BeaDraft[]>([]);
  const [imported, setImported] = useState<BeaImported[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [subject, setSubject] = useState("");
  const [recipient, setRecipient] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [body, setBody] = useState("");
  const [aiGenerated, setAiGenerated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [draftPages, importedPages] = await Promise.all([
          api.brain.listPages({ type: "bea_draft", limit: 50 }),
          api.brain.listPages({ type: "bea_message", limit: 50 }),
        ]);
        if (cancelled) return;
        setDrafts(draftPages.map((p) => {
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
          return {
            slug: p.slug,
            subject: String(fm.subject ?? p.title),
            recipient: String(fm.recipient ?? "—"),
            caseNumber: fm.case_reference ? String(fm.case_reference) : undefined,
            createdAt: p.updated_at?.split("T")[0] ?? "",
            aiGenerated: fm.ai_generated === true,
          };
        }));
        setImported(importedPages.map((p) => {
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
          return {
            slug: p.slug,
            subject: String(fm.subject ?? p.title),
            sender: String(fm.sender ?? "—"),
            sentDate: String(fm.sent_date ?? "").split("T")[0],
          };
        }));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "beA-Daten konnten nicht geladen werden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function saveDraft() {
    if (!subject.trim() || !recipient.trim()) {
      setStatusMessage("Betreff und Empfänger sind erforderlich.");
      return;
    }
    setSaving(true);
    setStatusMessage(null);
    const now = new Date();
    const slug = `legal/bea-drafts/${now.toISOString().split("T")[0]}-${subject.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").slice(0, 60)}`;
    try {
      await api.brain.createPage({
        slug,
        title: `beA-Entwurf: ${subject.trim()}`,
        type: "bea_draft",
        content: body,
        frontmatter: {
          subject: subject.trim(),
          recipient: recipient.trim(),
          case_reference: caseNumber.trim() || undefined,
          status: "draft",
          ...(aiGenerated ? AI_FRONTMATTER : {}),
        },
      });
      setDrafts((prev) => [{
        slug,
        subject: subject.trim(),
        recipient: recipient.trim(),
        caseNumber: caseNumber.trim() || undefined,
        createdAt: now.toISOString().split("T")[0],
        aiGenerated,
      }, ...prev]);
      setShowCompose(false);
      setSubject("");
      setRecipient("");
      setCaseNumber("");
      setBody("");
      setAiGenerated(false);
      setStatusMessage("Entwurf im Brain gespeichert.");
    } catch (e) {
      setStatusMessage(e instanceof Error ? `Speichern fehlgeschlagen: ${e.message}` : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="beA — elektronischer Rechtsverkehr"
        description="Nachrichten-Import und Entwurfsvorbereitung"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "beA" }]}
        actions={
          <Button
            variant="primary"
            className="bg-blue-600 hover:bg-blue-500 text-white gap-2 text-sm"
            onClick={() => setShowCompose(!showCompose)}
            aria-expanded={showCompose}
          >
            <FileText size={14} aria-hidden="true" />
            Entwurf erstellen
          </Button>
        }
      />

      {/* Honest framing: Subsumio does NOT send via beA */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5" role="note">
        <Info size={16} className="text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-sm text-amber-600">
          <p className="font-medium mb-1">Kein Versand über Subsumio</p>
          <p className="text-xs leading-relaxed">
            Der beA-Versand erfordert eine zertifizierte beA-Software mit Anwalts-Signaturkarte.
            Subsumio <strong>versendet keine Nachrichten</strong> — es importiert beA-Nachrichten
            via XML-Export (Konnektor <code className="font-mono">bea-import</code>) und speichert
            Entwürfe im Brain, die Sie in Ihrer beA-Software (z. B. beA-Webclient, RA-MICRO) versenden.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Status feedback for save actions */}
      <div aria-live="polite" className="min-h-5 text-xs text-[color:var(--ds-text-muted)]">{statusMessage}</div>

      {/* Compose */}
      {showCompose && (
        <form
          className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-4"
          onSubmit={(e) => { e.preventDefault(); void saveDraft(); }}
        >
          <h2 className="text-sm font-semibold text-blue-600">Neuer beA-Entwurf</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bea-recipient" className="text-xs text-[color:var(--ds-text-muted)] block mb-1">Empfänger (Gericht/Behörde) *</label>
              <input
                id="bea-recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="z. B. Amtsgericht München"
                required
                className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none focus:border-blue-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              />
            </div>
            <div>
              <label htmlFor="bea-case" className="text-xs text-[color:var(--ds-text-muted)] block mb-1">Aktenzeichen</label>
              <input
                id="bea-case"
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                placeholder="2026-001"
                className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none focus:border-blue-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              />
            </div>
          </div>
          <div>
            <label htmlFor="bea-subject" className="text-xs text-[color:var(--ds-text-muted)] block mb-1">Betreff *</label>
            <input
              id="bea-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="z. B. Klageerwiderung"
              required
              className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none focus:border-blue-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            />
          </div>
          <div>
            <label htmlFor="bea-body" className="text-xs text-[color:var(--ds-text-muted)] block mb-1">Nachrichtentext</label>
            <textarea
              id="bea-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Nachrichtentext…"
              className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none focus:border-blue-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 resize-y"
            />
          </div>
          {/* EU AI Act Art. 50: Nutzer markiert KI-generierten Inhalt, damit der
              Entwurf sichtbar + maschinenlesbar als KI-Output gekennzeichnet wird. */}
          <label htmlFor="bea-ai" className="flex items-start gap-2 cursor-pointer">
            <input
              id="bea-ai"
              type="checkbox"
              checked={aiGenerated}
              onChange={(e) => setAiGenerated(e.target.checked)}
              className="mt-0.5 accent-amber-500"
            />
            <span className="text-xs text-[color:var(--ds-text-muted)] leading-relaxed">
              Inhalt KI-generiert — als „{AI_BADGE_LABEL}&quot; kennzeichnen (EU AI Act Art. 50)
            </span>
          </label>
          <Button
            type="submit"
            variant="primary"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-500 text-white gap-2 text-sm"
          >
            {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
            Als Entwurf im Brain speichern
          </Button>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20" role="status" aria-label="beA-Nachrichten werden geladen">
          <Loader2 size={24} className="text-blue-600 animate-spin" aria-hidden="true" />
        </div>
      ) : (
        <>
          {/* Drafts */}
          <section aria-labelledby="bea-drafts-heading">
            <h2 id="bea-drafts-heading" className="text-sm font-semibold text-[color:var(--ds-text)] mb-2">
              Entwürfe ({drafts.length})
            </h2>
            <div className="space-y-2">
              {drafts.length === 0 ? (
                <p className="text-sm text-[color:var(--ds-text-muted)] py-4">Keine Entwürfe vorhanden.</p>
              ) : (
                drafts.map((msg) => (
                  <div
                    key={msg.slug}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0" aria-hidden="true">
                      <FileText size={14} className="text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[color:var(--ds-text)]">{msg.subject}</span>
                        <Badge variant="default" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                          Entwurf
                        </Badge>
                        {msg.aiGenerated && (
                          <Badge variant="default" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30">
                            {AI_BADGE_LABEL}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-[color:var(--ds-text-muted)] mt-0.5">
                        An: {msg.recipient} {msg.caseNumber && `· Akte ${msg.caseNumber}`} · {msg.createdAt}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Imported messages from the bea-import connector */}
          <section aria-labelledby="bea-imported-heading">
            <h2 id="bea-imported-heading" className="text-sm font-semibold text-[color:var(--ds-text)] mb-2">
              Importierte Nachrichten ({imported.length})
            </h2>
            <div className="space-y-2">
              {imported.length === 0 ? (
                <div className="text-sm text-[color:var(--ds-text-muted)] py-4 space-y-1">
                  <p>Keine importierten beA-Nachrichten.</p>
                  <p className="text-xs">
                    Import einrichten: <code className="font-mono text-blue-600">gbrain connector add bea-import --watch-dir ~/Downloads/bea</code>
                  </p>
                </div>
              ) : (
                imported.map((msg) => (
                  <div
                    key={msg.slug}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0" aria-hidden="true">
                      <Inbox size={14} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-[color:var(--ds-text)]">{msg.subject}</span>
                      <div className="text-xs text-[color:var(--ds-text-muted)] mt-0.5">
                        Von: {msg.sender} · {msg.sentDate}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
