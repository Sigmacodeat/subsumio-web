/**
 * Öffentliches Erstanfrage-Formular — anonym, ohne Anmeldung, mit
 * Kollisionsprüfung VOR der Aktenanlage (§ 10 RAO). Bisher gab es keinen
 * Weg für eine interessierte Person, ohne Konto/WhatsApp eine Anfrage zu
 * stellen: api/intake/route.ts verlangt eine Kanzlei-Session
 * (createHandler), das öffentliche api/concierge ist Subsumios eigener
 * Vertriebs-Chatbot, keine Kanzlei-Funktion.
 *
 * Ablauf: Kollisionsprüfung gegen die Engine (serverseitig, mit
 * kanzleispezifischen, aber nicht auf einen eingeloggten Nutzer
 * beschränkten Headern) → intake_request-Seite anlegen (source: "web",
 * conflict_check_status aus dem Ergebnis) → Kanzlei per Mail benachrichtigen,
 * wenn eine Adresse hinterlegt ist. Der Anfragende bekommt NIE eine
 * Bestätigungsmail an eine von ihm angegebene Adresse (Mail-Bombing-Vektor
 * — dieselbe Regel wie beim bestehenden Website-Kontaktformular,
 * api/concierge/lead/route.ts) und erfährt nie, ob ein Kollisionstreffer
 * vorlag — das würde selbst schon vertrauliche Mandantenbeziehungen
 * verraten.
 *
 * Welche Kanzlei (Brain) eine Anfrage erreicht, ist bei dieser
 * Ein-Instanz-pro-Kanzlei-Architektur über eine Umgebungsvariable
 * festgelegt (siehe resolvePublicIntakeBrainId) — es gibt (Stand
 * 22.09.2026) keine Mandanten-URL-Konvention wie bei einer Multi-Tenant-SaaS.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { KANZLEI_SETTINGS_SLUG } from "@/lib/kanzlei-settings";
import { buildIntakeRequest, type IntakeRequestFrontmatter } from "@/lib/intake";
import { sendMail } from "@/lib/mail";
import { logger } from "@/lib/logger";

const log = logger("api/intake/public");

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+\d\s()/-]*$/, "invalid_phone")
    .optional()
    .or(z.literal("")),
  legalArea: z.string().trim().max(80).optional(),
  /** Gegenseite — für die Kollisionsprüfung (§ 10 RAO) mindestens so
   *  wichtig wie der Anfragende selbst. */
  opponent: z.string().trim().max(200).optional(),
  message: z.string().trim().min(1).max(4000),
  /** DSGVO-Einwilligung zur Verarbeitung dieser Anfrage. */
  consent: z.literal(true),
  /** Honeypot — für Menschen unsichtbar. */
  website: z.string().max(0).optional(),
});

/**
 * Bei dieser Ein-Instanz-pro-Kanzlei-Architektur genügt eine feste
 * Ziel-Brain-ID aus der Umgebung — derselbe Ansatz wie
 * WHATSAPP_DEFAULT_BRAIN_ID für eingehende WhatsApp-Nachrichten
 * (api/whatsapp/webhook/route.ts).
 */
function resolvePublicIntakeBrainId(): string | null {
  return (
    process.env.SUBSUMIO_PUBLIC_INTAKE_BRAIN_ID || process.env.WHATSAPP_DEFAULT_BRAIN_ID || null
  );
}

interface ConflictCheckResult {
  severity?: "critical" | "low" | "none";
}

/**
 * `side` is the role of the name in the requested mandate: the requester is
 * the prospective client, the named opponent the prospective opponent. A
 * requester who is the opponent in an existing Akte (or an opponent who is an
 * existing client) is a conflict, not "clear".
 */
async function checkConflict(
  brainId: string,
  name: string,
  side: "client" | "opponent"
): Promise<IntakeRequestFrontmatter["conflict_check_status"]> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/legal/conflict-check`, {
      method: "POST",
      headers: { ...engineHeadersForBrain(brainId), "Content-Type": "application/json" },
      body: JSON.stringify({ name, side }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return "needs_review";
    const data = (await res.json()) as ConflictCheckResult;
    if (data.severity === "critical") return "conflict";
    if (data.severity === "low") return "needs_review";
    if (data.severity === "none") return "clear";
    return "needs_review";
  } catch (err) {
    log.warn("conflict check unavailable, flagging for manual review", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "needs_review";
  }
}

export const POST = createPublicHandler(
  {
    body: bodySchema,
    rateLimitKey: (req: NextRequest) => `intake-public:${clientIp(req.headers)}`,
    rateLimitMax: 5,
    rateLimitWindowMs: 60 * 60_000,
  },
  async (_req, body) => {
    if (body.website) return apiError("invalid", "invalid", 400);

    const brainId = resolvePublicIntakeBrainId();
    if (!brainId) {
      log.error(
        "SUBSUMIO_PUBLIC_INTAKE_BRAIN_ID not configured — public intake form cannot file requests"
      );
      return apiError(
        "not_configured",
        "Das Erstanfrage-Formular ist derzeit nicht verfügbar. Bitte kontaktieren Sie uns telefonisch oder per E-Mail.",
        503
      );
    }

    const headers = engineHeadersForBrain(brainId);
    // Kollisionsprüfung auf Anfragenden UND Gegenseite — die Gegenseite ist
    // der eigentliche § 10-RAO-Konflikt (bestehendes Mandat der Gegenseite).
    let conflictStatus = await checkConflict(brainId, body.name, "client");
    if (body.opponent && conflictStatus !== "conflict") {
      const opponentStatus = await checkConflict(brainId, body.opponent, "opponent");
      if (opponentStatus === "conflict") conflictStatus = "conflict";
      else if (opponentStatus === "needs_review" && conflictStatus === "clear")
        conflictStatus = "needs_review";
    }

    const page = buildIntakeRequest({
      source: "web",
      summary: body.message,
      clientName: body.name,
      email: body.email || undefined,
      legalArea: body.legalArea || undefined,
      status: "new",
      conflictCheckStatus: conflictStatus,
    });
    // phone is stored hashed elsewhere (WhatsApp path) for lookup; here it's
    // just contact info the firm needs to call back, kept in the clear like
    // email — matches how api/intake/route.ts's manual/web sources handle it.
    const frontmatterWithPhone = {
      ...page.frontmatter,
      phone: body.phone || undefined,
      opponent: body.opponent || undefined,
    };

    const createRes = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: page.slug,
        title: page.title,
        type: "intake_request",
        content: page.content,
        frontmatter: frontmatterWithPhone,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!createRes.ok) {
      log.error("failed to persist public intake request", { status: createRes.status });
      return apiError(
        "engine_unreachable",
        "Ihre Anfrage konnte nicht übermittelt werden. Bitte versuchen Sie es später erneut.",
        503
      );
    }

    // Best-effort: notify the firm's own inbox. Never blocks the visitor's
    // success response, and never reveals the conflict-check result — a
    // Kanzlei staff member reviews it in /dashboard/intake either way.
    void (async () => {
      try {
        const settingsRes = await fetch(
          `${ENGINE_URL}/api/pages/${encodeURIComponent(KANZLEI_SETTINGS_SLUG)}`,
          { headers, signal: AbortSignal.timeout(10_000) }
        );
        if (!settingsRes.ok) return;
        const settingsPage = (await settingsRes.json()) as {
          frontmatter?: { kanzleiEmail?: string };
        };
        const inbox = settingsPage.frontmatter?.kanzleiEmail;
        if (!inbox) return;
        await sendMail({
          to: inbox,
          subject: `Neue Erstanfrage über die Website: ${body.name}`,
          text: [
            `Neue Erstanfrage über das Website-Formular.`,
            ``,
            `Name: ${body.name}`,
            body.email ? `E-Mail: ${body.email}` : "",
            body.phone ? `Telefon: ${body.phone}` : "",
            body.legalArea ? `Rechtsgebiet: ${body.legalArea}` : "",
            body.opponent ? `Gegenseite: ${body.opponent}` : "",
            ``,
            `Nachricht:`,
            body.message,
            ``,
            `Zur Prüfung (inkl. Kollisionsstatus) im Dashboard unter Aufnahme.`,
          ]
            .filter(Boolean)
            .join("\n"),
          replyTo: body.email || undefined,
        });
      } catch (err) {
        log.warn("intake notification mail failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return Response.json({ ok: true });
  }
);
