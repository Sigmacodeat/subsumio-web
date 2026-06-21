import type { Jurisdiction } from "@/components/chat/chat-types";

export const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  de: "deutschen",
  at: "österreichischen",
  ch: "schweizerischen",
  eu: "EU-",
};

export function getJurisdictionLabel(jurisdiction: Jurisdiction): string {
  return JURISDICTION_LABELS[jurisdiction];
}

export function buildSystemPrompt(jurisdiction: Jurisdiction): string {
  const jurisdictionLabel = JURISDICTION_LABELS[jurisdiction];
  return `Du bist der Brain Copilot für eine Kanzlei im ${jurisdictionLabel} Rechtsraum. Beantworte präzise unter Berücksichtigung des ${jurisdictionLabel} Rechts. Zitiere Gesetze mit § und Absatz, und gib am Ende an: "Diese Information ersetzt keine anwaltliche Prüfung."\n\nWICHTIG — MANDANTENISOLATION:\nWenn eine konkrete Akte aktiv ist, beantworte Fragen NUR im Kontext dieser Akte. Vermeide mandantenübergreifende Informationen. Wenn ein Nutzer nach anderen Mandanten fragt, weise darauf hin, dass du nur im Kontext der aktuellen Akte antworten kannst.\n\nDu hast Zugriff auf Kanzlei-Funktionen. Wenn der Nutzer eine Aktion wünscht, kannst du Tool-Marker in deine Antwort einbetten (unsichtbar für den Nutzer, aber vom System erkannt):\n- Navigation: [TOOL:navigate route="/dashboard/cases"]\n- Akten suchen: [TOOL:search_cases query="Muster GmbH"]\n- Fristen prüfen: [TOOL:search_deadlines status="open"] oder [TOOL:search_deadlines case_slug="cases/123" status="overdue"]\n- Wissen suchen: [TOOL:search_knowledge query="BGB § 280"]\n- Akte erstellen: [TOOL:create_case title="Klage Muster GmbH" client_name="Max Mustermann" opponent_name="Gegner AG"]\n- Aktenzusammenfassung: [TOOL:case_summary case_slug="cases/123"]\n- Email-Entwurf: [TOOL:email_draft subject="Status Update" recipient="mandant@email.de" case_slug="cases/123" tone="formal"]\n- Fristen extrahieren: [TOOL:deadline_extract document_slug="urteil-2026"]\n- Dokument zusammenfassen: [TOOL:document_summary document_slug="vertrag-2026"]\n- Konfliktprüfung: [TOOL:conflict_check name="Muster GmbH"]\n- Zeiteintrag: [TOOL:time_entry case_slug="cases/123" description="Aktenanalyse" hours="1.5" activity_type="research"]\n- Mandanten-Update: [TOOL:client_update case_slug="cases/123" update_type="status"]\n- Besprechungsnotizen: [TOOL:meeting_tasks notes="Besprechung mit Mandant..." case_slug="cases/123"]\n- Mandantsaufnahme: [TOOL:intake_create client_name="Max Mustermann" matter_type="Zivilrecht" jurisdiction="de" urgency="medium"]\n\nVerwende Tools nur wenn der Nutzer explizit eine Aktion wünscht. Antworte sonst normal.\n\nDu kannst MEHRERE Tool-Marker in einer einzigen Antwort verwenden, wenn mehrere Aktionen sinnvoll sind (z.B. zuerst eine Akte suchen, dann eine Frist prüfen). Setze jeden Marker in eine eigene Zeile.\n\nWICHTIG: Tools, die Daten erstellen oder verändern (create_case, intake_create, time_entry), erfordern eine Bestätigung durch den Nutzer. Betten Sie diese Tool-Marker wie gewohnt ein — das System zeigt dem Nutzer einen Bestätigungsdialog an.`;
}

interface PromptContextParams {
  jurisdiction: Jurisdiction;
  selectedCaseSlug: string;
  cases: Array<{ slug: string; title: string }>;
  contextType: string;
  contextCaseSlug?: string;
  pageSlug?: string;
  attachments?: Array<{ name: string; slug: string }>;
  replyTo?: { id: string; role: "user" | "assistant"; preview: string } | null;
  userText: string;
  attachmentFetcher?: (slug: string) => Promise<string>;
}

export async function buildPromptContext(
  params: PromptContextParams
): Promise<{ systemPrompt: string; userInput: string }> {
  const {
    jurisdiction,
    selectedCaseSlug,
    cases,
    contextType,
    contextCaseSlug,
    pageSlug,
    attachments,
    replyTo,
    userText,
    attachmentFetcher,
  } = params;

  const contextParts: string[] = [];

  // Attachments
  if (attachments && attachments.length > 0) {
    contextParts.push("--- ANGEHÄNGTE DOKUMENTE ---");
    for (const att of attachments) {
      try {
        if (attachmentFetcher) {
          const content = await attachmentFetcher(att.slug);
          contextParts.push(`\nDOKUMENT: ${att.name}\n${content.slice(0, 8000)}\n`);
        } else {
          contextParts.push(`\nDOKUMENT: ${att.name}\n[Inhalt nicht abrufbar]\n`);
        }
      } catch {
        contextParts.push(`\nDOKUMENT: ${att.name}\n[Inhalt nicht abrufbar]\n`);
      }
    }
    contextParts.push("--- ENDE DOKUMENTE ---\n");
  }

  // Case context
  if (selectedCaseSlug) {
    const selected = cases.find((c) => c.slug === selectedCaseSlug);
    contextParts.push(
      `--- AKTENKONTEXT ---\nAktive Akte: ${selected?.title ?? selectedCaseSlug}\nSlug: ${selectedCaseSlug}\nNutze Matter Context und zitiere nur belegte Aussagen.\n--- ENDE AKTENKONTEXT ---\n`
    );
  }

  // Brain page context
  if (contextType === "brain_page" && pageSlug) {
    contextParts.push(
      `--- SEITENKONTEXT ---\nBrain-Seite: ${pageSlug}\nBeantworte Fragen im Kontext dieser Seite.\n--- ENDE SEITENKONTEXT ---\n`
    );
  }

  // Reply-to context
  if (replyTo) {
    contextParts.push(
      `--- ZITIERTE NACHRICHT ---\nAntworte auf die folgende ${replyTo.role === "user" ? "Nutzernachricht" : "KI-Antwort"}:\n"${replyTo.preview}"\n--- ENDE ZITAT ---`
    );
  }

  const systemPrompt = buildSystemPrompt(jurisdiction);
  const userInput = `${contextParts.join("\n")}\nNUTZERFRAGE:\n${userText}`;

  return { systemPrompt, userInput };
}

export function processStreamingChunk(
  chunk: string,
  buffer: string,
  setMessages: (
    updater: (
      prev: import("@/components/chat/chat-types").ChatMessage[]
    ) => import("@/components/chat/chat-types").ChatMessage[]
  ) => void
): string {
  const combined = buffer + chunk;
  let newBuffer = "";

  const lastOpen = combined.lastIndexOf("[TOOL:");
  if (lastOpen !== -1 && combined.indexOf("]", lastOpen) === -1) {
    newBuffer = combined.slice(lastOpen);
    const beforeMarker = combined.slice(0, lastOpen);
    const cleanChunk = beforeMarker.replace(/\[TOOL:[^\]]*\]/gi, "");
    if (!cleanChunk) return newBuffer;
    setMessages((m) => {
      const last = m[m.length - 1];
      if (!last || last.role !== "assistant") return m;
      return [...m.slice(0, -1), { ...last, content: last.content + cleanChunk }];
    });
    return newBuffer;
  }

  const cleanChunk = combined.replace(/\[TOOL:[^\]]*\]/gi, "");
  if (!cleanChunk) return newBuffer;
  setMessages((m) => {
    const last = m[m.length - 1];
    if (!last || last.role !== "assistant") return m;
    return [...m.slice(0, -1), { ...last, content: last.content + cleanChunk }];
  });
  return newBuffer;
}
