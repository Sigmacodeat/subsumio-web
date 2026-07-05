import { z } from "zod";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { verifyPortalToken } from "@/lib/portal-token";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import type { BrainPage } from "@/lib/types";

const chatSchema = z.object({
  token: z.string().min(1, "token_required"),
  message: z.string().min(1, "message_required").max(4_000, "message_too_long"),
});

interface CaseDocument {
  slug: string;
  title: string;
  content: string;
  type: string;
}

const REFUSAL_RESPONSES = [
  "Ich kann ausschließlich Auskünfte zu Ihrer eigenen Akte geben. Fragen zu anderen Akten oder internen Notizen kann ich nicht beantworten.",
  "Aus Datenschutzgründen habe ich nur Zugriff auf die Dokumente Ihrer eigenen Akte.",
  "Ich bin auf Ihre Akte beschränkt und kann keine Informationen zu anderen Mandanten oder internen Kanzlei-Prozessen geben.",
];

function isAdversarialQuery(message: string): boolean {
  const lower = message.toLowerCase();
  const adversarialPatterns = [
    /andere akte/,
    /andere mandanten?/,
    /andere falle/,
    /intern(e|er|es) notiz/,
    /kanzlei intern/,
    /geheim/,
    /andere klient/,
    /other cases?/,
    /other clients?/,
    /internal notes?/,
    /confidential/,
    /alle akten/,
    /alle mandanten/,
    /alle klient/,
    /andere rechtsanwalt/,
    /other lawyers?/,
    /personalakten?/,
    /mitarbeiter/,
    /staff/,
    /gehalt/,
    /salary/,
    /finanzen der kanzlei/,
    /kanzlei.*finanzen/,
  ];
  return adversarialPatterns.some((p) => p.test(lower));
}

function buildGroundedPrompt(
  message: string,
  caseData: { title: string; caseNumber: string; facts: string; legalArea: string },
  documents: CaseDocument[]
): string {
  const docContext = documents
    .slice(0, 10)
    .map((d) => `--- ${d.title} (${d.type}) ---\n${d.content.slice(0, 2000)}`)
    .join("\n\n");

  return [
    "Du bist ein Kanzlei-Portal-Chatbot. Du beantwortest AUSSCHLIESSLICH Fragen zur Akte des Mandanten.",
    "Du hast keinen Zugriff auf andere Akten, interne Notizen oder Kanzlei-Interna.",
    "Verweigere höflich jede Frage, die sich auf andere Mandanten, interne Prozesse oder vertrauliche Informationen bezieht.",
    "",
    `Akte: ${caseData.title} (${caseData.caseNumber})`,
    `Rechtsgebiet: ${caseData.legalArea}`,
    `Sachverhalt: ${caseData.facts.slice(0, 3000)}`,
    "",
    "Verfügbare Dokumente in dieser Akte:",
    docContext || "(keine Dokumente verfügbar)",
    "",
    "Mandantenfrage:",
    message,
    "",
    "Antworte auf Deutsch, höflich und verständlich. Verweise auf die vorliegenden Dokumente.",
  ].join("\n");
}

export const POST = createPublicHandler(
  {
    body: chatSchema,
    cors: true,
    skipCsrf: true,
    rateLimitKey: (req) => `portal-chat:${clientIp(req.headers)}`,
    rateLimitMax: 10,
    rateLimitWindowMs: 60_000,
  },
  async (_req, body, _query) => {
    const payload = await verifyPortalToken(body.token);
    if (!payload) {
      return apiError("invalid_or_expired_token", "Token ungültig oder abgelaufen", 403);
    }
    if (!payload.brain_id) {
      return apiError("new_portal_link_required", "Neuer Portal-Link erforderlich", 403);
    }

    if (isAdversarialQuery(body.message)) {
      const refusal = REFUSAL_RESPONSES[Math.floor(Math.random() * REFUSAL_RESPONSES.length)]!;
      return Response.json({
        answer: refusal,
        grounded: false,
        escalated: false,
      });
    }

    const headers = engineHeadersForBrain(payload.brain_id);

    const caseRes = await fetch(
      `${ENGINE_URL}/api/pages/${encodeURIComponent(payload.case_slug)}`,
      { headers, signal: AbortSignal.timeout(10_000) }
    );
    if (!caseRes.ok) return apiError("case_not_found", "Akte nicht gefunden", 404);
    const casePage = (await caseRes.json()) as BrainPage;
    const fm = (casePage.frontmatter ?? {}) as Record<string, unknown>;

    const docsRes = await fetch(`${ENGINE_URL}/api/pages?type=document&limit=50`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    const documents: CaseDocument[] = [];
    if (docsRes.ok) {
      const docsData = await docsRes.json();
      const pages: BrainPage[] = Array.isArray(docsData) ? docsData : (docsData.pages ?? []);
      for (const p of pages) {
        const pfm = (p.frontmatter ?? {}) as Record<string, unknown>;
        if (pfm.case_slug === payload.case_slug) {
          documents.push({
            slug: p.slug,
            title: p.title,
            content: p.content ?? "",
            type: String(pfm.type ?? "document"),
          });
        }
      }
    }

    const prompt = buildGroundedPrompt(
      body.message,
      {
        title: casePage.title,
        caseNumber: String(fm.case_number ?? ""),
        facts: casePage.content ?? "",
        legalArea: String(fm.legal_area ?? ""),
      },
      documents
    );

    let answer: string;
    try {
      const chatRes = await fetch(`${ENGINE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          message: prompt,
          context: { type: "case", caseSlug: payload.case_slug },
          stream: false,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!chatRes.ok) {
        return Response.json({
          answer:
            "Ich kann derzeit keine Antwort generieren. Bitte kontaktieren Sie Ihre Kanzlei direkt.",
          grounded: false,
          escalated: false,
        });
      }

      const chatData = await chatRes.json();
      answer = String(chatData.answer ?? chatData.message ?? chatData.text ?? "");
      if (!answer) {
        answer =
          "Ich konnte keine Antwort generieren. Bitte formulieren Sie Ihre Frage anders oder kontaktieren Sie Ihre Kanzlei.";
      }
    } catch {
      answer =
        "Es ist ein technischer Fehler aufgetreten. Bitte versuchen Sie es später erneut oder kontaktieren Sie Ihre Kanzlei.";
    }

    const slug = `portal-chat/${payload.case_slug}/${Date.now()}`;
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        slug,
        title: "Portal-Chat",
        type: "portal_chat",
        content: answer,
        frontmatter: {
          type: "portal_chat",
          case_slug: payload.case_slug,
          question: body.message,
          sender: "bot",
          grounded: true,
          created_at: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {});

    return Response.json({
      answer,
      grounded: true,
      escalated: false,
    });
  }
);
