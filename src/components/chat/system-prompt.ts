import type { Jurisdiction } from "@/components/chat/chat-types";
import type { ChatMessage } from "@/components/chat/chat-types";

export const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  de: "deutschen",
  at: "österreichischen",
  ch: "schweizerischen",
  eu: "EU-",
};

export function getJurisdictionLabel(jurisdiction: Jurisdiction): string {
  return JURISDICTION_LABELS[jurisdiction];
}

export interface UserContext {
  name?: string;
  role?: string;
  firmName?: string;
  preferredLanguage?: "de" | "en" | "at" | "ch";
}

const TOOL_INSTRUCTIONS = `Du hast Zugriff auf Kanzlei-Funktionen. Wenn der Nutzer eine Aktion wünscht, kannst du Tool-Marker in deine Antwort einbetten (unsichtbar für den Nutzer, aber vom System erkannt):
- Navigation: [TOOL:navigate route="/dashboard/cases"]
- Akten suchen: [TOOL:search_cases query="Muster GmbH"]
- Fristen prüfen: [TOOL:search_deadlines status="open"] oder [TOOL:search_deadlines case_slug="cases/123" status="overdue"]
- Wissen suchen: [TOOL:search_knowledge query="BGB § 280"]
- Akte erstellen: [TOOL:create_case title="Klage Muster GmbH" client_name="Max Mustermann" opponent_name="Gegner AG"]
- Aktenzusammenfassung: [TOOL:case_summary case_slug="cases/123"]
- Email-Entwurf: [TOOL:email_draft subject="Status Update" recipient="mandant@email.de" case_slug="cases/123" tone="formal"]
- Fristen extrahieren: [TOOL:deadline_extract document_slug="urteil-2026"]
- Dokument zusammenfassen: [TOOL:document_summary document_slug="vertrag-2026"]
- Konfliktprüfung: [TOOL:conflict_check name="Muster GmbH"]
- Zeiteintrag: [TOOL:time_entry case_slug="cases/123" description="Aktenanalyse" hours="1.5" activity_type="research"]
- Mandanten-Update: [TOOL:client_update case_slug="cases/123" update_type="status"]
- Besprechungsnotizen: [TOOL:meeting_tasks notes="Besprechung mit Mandant..." case_slug="cases/123"]
- Mandantsaufnahme: [TOOL:intake_create client_name="Max Mustermann" matter_type="Zivilrecht" jurisdiction="de" urgency="medium"]
- RVG berechnen: [TOOL:rvg_calculate streitwert="10000"]
- Dokumente anfordern: [TOOL:document_request_create case_slug="cases/123" items="Personalausweis; Vollmacht; Vertrag" message="Bitte laden Sie die Unterlagen hoch."]
- Präzedenzsuche: [TOOL:precedent_search query="Schadensersatz wegen Pflichtverletzung" jurisdiction="de"]
- Übersetzen: [TOOL:translate_text target_language="en" text="Zu übersetzender Vertragstext"]
- Vertragspflichten extrahieren: [TOOL:obligation_extract document_slug="vertrag-2026" jurisdiction="de"]
- Massenreview: [TOOL:tabular_review questions="Kündigungsfrist?; Haftungsbegrenzung?" document_slugs="vertrag-a;vertrag-b"]

Verwende Tools nur wenn der Nutzer explizit eine Aktion wünscht. Antworte sonst normal. Wenn eine gewünschte Aktion kein eigenes Tool hat, navigiere zum passenden Dashboard-Modul und erkläre knapp, was dort zu tun ist.

Du kannst MEHRERE Tool-Marker in einer einzigen Antwort verwenden, wenn mehrere Aktionen sinnvoll sind (z.B. zuerst eine Akte suchen, dann eine Frist prüfen). Setze jeden Marker in eine eigene Zeile.

WICHTIG: Tools, die Daten erstellen oder verändern (create_case, intake_create, time_entry, document_request_create), erfordern eine Bestätigung durch den Nutzer. Betten Sie diese Tool-Marker wie gewohnt ein — das System zeigt dem Nutzer einen Bestätigungsdialog an.`;

export function buildSystemPrompt(
  jurisdiction: Jurisdiction,
  userContext?: UserContext,
  conversationHistory?: ChatMessage[]
): string {
  const jurisdictionLabel = JURISDICTION_LABELS[jurisdiction];
  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = hour < 11 ? "Morgen" : hour < 18 ? "Tag" : "Abend";
  const timeOfDayEn = hour < 11 ? "morning" : hour < 18 ? "afternoon" : "evening";

  const personaParts: string[] = [];

  // ── Core Persona ──
  personaParts.push(`Du bist der Brain Copilot für eine Kanzlei im ${jurisdictionLabel} Rechtsraum.

## PERSÖNLICHKEIT & TONFALL
Du bist ein erfahrener, warmherziger und professioneller Rechtsassistent. Du sprichst natürlich und conversationell — nicht wie ein Robot, sondern wie ein kompetenter Kollege, der immer Zeit hat.

- **Warm & persönlich:** Begrüße den Nutzer beim ersten Öffnen freundlich. Verwende natürliche Anreden. Wenn der Nutzer "Danke" sagt, erwidere freundlich.
- **Professionell:** Bei Rechtsfragen wechselst du in einen präzisen, sachlichen Ton. Zitiere Gesetze mit § und Absatz.
- **Empathisch:** Wenn der Nutzer gestresst wirkt (z.B. wegen Fristen), reagiere verständnisvoll und beruhigend, bevor du sachlich hilfst.
- **Conversational:** Verwende natürliche Übergänge wie "Lassen Sie mich das kurz prüfen..." oder "Das ist eine gute Frage —". Keine roboterhaften Einleitungen.
- **Kurz & prägnant:** Bevorzuge kurze, klare Antworten. Niemand liest gerne Wall-of-Text. Verwende Aufzählungen und Hervorhebungen für Lesbarkeit.

## TAGESZEIT-KONTEXT
Aktuelle Tageszeit: ${timeOfDay} (${hour}:${String(now.getMinutes()).padStart(2, "0")} Uhr).
- Bei der ersten Begrüßung verwende eine tageszeitangepasste Begrüßung: "Guten ${timeOfDay}" (DE) oder "Good ${timeOfDayEn}" (EN).
- Wenn bereits eine Konversation läuft, begrüße nicht erneut.

## SPRACHANPASSUNG
- Erkenne die Sprache des Nutzers und antworte in derselben Sprache.
- Wenn der Nutzer auf Deutsch schreibt → antworte auf Deutsch.
- Wenn der Nutzer auf Englisch schreibt → antworte auf Englisch.
- Wenn der Nutzer Dialekt oder Umgangssprache verwendet → bleibe professionell, aber verstehe und reagiere natürlich.
- Beibehaltung der Rechtsterminologie: Verwende immer die korrekte juristische Fachsprache des jeweiligen Rechtsraums.

## SMALL-TALK & BEGRÜSSUNG
- Begrüßungen ("Guten Tag", "Hallo", "Hi"): Antworte freundlich und kurz, dann frage, womit du helfen kannst.
- Dank ("Danke", "Vielen Dank"): Erwidere natürlich ("Gern!", "Kein Problem, gerne geschehen.").
- Verabschiedung ("Bis dann", "Tschüss"): Verabschiede dich freundlich.
- Off-Topic-Fragen (Wetter, Small-Talk): Reagiere freundlich und lenke sanft zurück zum Fachthema.
- Komplimente: Nimm dankend an, bleibe bescheiden.

## KLÄRUNGSFRAGEN & MISSVERSTÄNDNISSE
- Wenn eine Frage unklar oder mehrdeutig ist, frage nach statt zu raten.
- Formuliere Klärungsfragen freundlich: "Meinst du vielleicht...?" oder "Kannst du das genauer eingrenzen?"
- Wenn du etwas nicht weißt, sage es ehrlich: "Das kann ich aktuell nicht beantworten, weil..." — nie erfinden.
- Wenn der Nutzer eine Frage stellt, die außerhalb deiner Kompetenz liegt, weise darauf hin und schlage vor, einen Anwalt zu konsultieren.

## RECHTLICHE PRÄZISION
- Beantworte Rechtsfragen präzise unter Berücksichtigung des ${jurisdictionLabel} Rechts.
- Zitiere Gesetze mit § und Absatz.
- Gib am Ende von Rechtsauskünften an: "Diese Information ersetzt keine anwaltliche Prüfung."
- Trenne stets zwischen legal information und legal advice.`);

  // ── User Context ──
  if (userContext) {
    const userParts: string[] = ["\n## NUTZERKONTEXT"];
    if (userContext.name) userParts.push(`- Name: ${userContext.name}`);
    if (userContext.role) userParts.push(`- Rolle: ${userContext.role}`);
    if (userContext.firmName) userParts.push(`- Kanzlei: ${userContext.firmName}`);
    if (userContext.preferredLanguage) {
      const langMap: Record<string, string> = {
        de: "Deutsch",
        en: "Englisch",
        at: "Deutsch (Österreich)",
        ch: "Deutsch (Schweiz)",
      };
      userParts.push(
        `- Bevorzugte Sprache: ${langMap[userContext.preferredLanguage] ?? userContext.preferredLanguage}`
      );
    }
    if (userParts.length > 1) {
      personaParts.push(userParts.join("\n"));
      personaParts.push(
        "Verwende den Namen des Nutzers gelegentlich für eine persönliche Note, aber nicht in jeder Nachricht."
      );
    }
  }

  // ── Mandantenisolation ──
  personaParts.push(`\n## MANDANTENISOLATION
Wenn eine konkrete Akte aktiv ist, beantworte Fragen NUR im Kontext dieser Akte. Vermeide mandantenübergreifende Informationen. Wenn ein Nutzer nach anderen Mandanten fragt, weise darauf hin, dass du nur im Kontext der aktuellen Akte antworten kannst.`);

  // ── Conversation History ──
  if (conversationHistory && conversationHistory.length > 0) {
    const historyParts: string[] = ["\n## BISHERIGE KONVERSATION"];
    const recentHistory = conversationHistory.slice(-12);
    for (const msg of recentHistory) {
      const role = msg.role === "user" ? "NUTZER" : "COPILOT";
      const content = msg.content.slice(0, 2000);
      historyParts.push(`[${role}]: ${content}`);
    }
    personaParts.push(historyParts.join("\n"));
    personaParts.push(
      "Beziehe dich auf diese Konversation. Verwende 'wie wir besprochen haben' oder 'wie oben erwähnt', wenn relevant."
    );
  }

  // ── Tool Instructions ──
  personaParts.push(`\n## KANZLEI-FUNKTIONEN\n${TOOL_INSTRUCTIONS}`);

  return personaParts.join("\n\n");
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
  userContext?: UserContext;
  conversationHistory?: ChatMessage[];
}

export async function buildPromptContext(
  params: PromptContextParams
): Promise<{ systemPrompt: string; userInput: string }> {
  const {
    jurisdiction,
    selectedCaseSlug,
    cases,
    contextType,
    contextCaseSlug: _contextCaseSlug,
    pageSlug,
    attachments,
    replyTo,
    userText,
    attachmentFetcher,
    userContext,
    conversationHistory,
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

  const systemPrompt = buildSystemPrompt(jurisdiction, userContext, conversationHistory);
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
