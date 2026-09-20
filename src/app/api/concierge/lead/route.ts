// Contact request from the website — the chat's "ein Mensch meldet sich"
// card and the contact page both post here. Stored with the consent timestamp
// and forwarded to the sales inbox with the (redacted) chat so far, so nobody
// has to ask the visitor the same things twice.
//
// No confirmation mail goes to the address entered: a public form that sends
// mail to any address is a mail-bombing tool. The visitor sees the
// confirmation on screen; our reply is the confirmation.

import { NextRequest } from "next/server";
import { z } from "zod";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { saveLead, sessionTranscript, type LeadInput } from "@/lib/concierge/store";

const log = logger("api/concierge/lead");

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<LeadInput["kind"], string> = {
  callback: "Rückruf",
  meeting: "Termin / Demo",
  question: "Frage",
  enterprise: "Enterprise-Anfrage",
};

const bodySchema = z.object({
  kind: z.enum(["callback", "meeting", "question", "enterprise"]),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  firm: z.string().trim().max(200).optional(),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+\d\s()/-]*$/, "invalid_phone")
    .optional(),
  message: z.string().trim().max(2000).optional(),
  preferredTime: z.string().trim().max(200).optional(),
  firmSize: z.string().trim().max(40).optional(),
  sessionId: z.string().uuid().optional(),
  page: z.string().max(200).optional(),
  profile: z.record(z.string().max(200)).optional(),
  /** Consent to be contacted about this request (Art. 6(1)(b) GDPR, pre-contract). */
  consent: z.literal(true),
  /** Honeypot: humans never see this field. */
  website: z.string().max(0).optional(),
});

export const POST = createPublicHandler(
  {
    body: bodySchema,
    rateLimitKey: (req: NextRequest) => `concierge-lead:${clientIp(req.headers)}`,
    rateLimitMax: 5,
    rateLimitWindowMs: 60 * 60_000,
  },
  async (_req, body) => {
    if (body.website) return apiError("invalid", "invalid", 400);

    const { consent: _c, website: _w, ...input } = body;
    void _c;
    void _w;
    const lead = await saveLead(input);

    const transcript = body.sessionId
      ? await sessionTranscript(body.sessionId).catch(() => [])
      : [];
    const profile = Object.entries(body.profile ?? {})
      .filter(([, v]) => v)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    const lines = [
      `Neue ${KIND_LABEL[body.kind]} über die Website`,
      "",
      `Name: ${body.name}`,
      `E-Mail: ${body.email}`,
      body.phone ? `Telefon: ${body.phone}` : "",
      body.firm ? `Kanzlei: ${body.firm}` : "",
      body.firmSize ? `Kanzleigröße: ${body.firmSize}` : "",
      body.preferredTime ? `Wunschtermin: ${body.preferredTime}` : "",
      body.page ? `Seite: ${body.page}` : "",
      body.message ? `\nNachricht:\n${body.message}` : "",
      profile ? `\nAus dem Chat erkannt:\n${profile}` : "",
      transcript.length
        ? `\nChatverlauf (personenbezogene Daten entfernt):\n${transcript
            .map((t) => `> ${t.question}\n${t.answer}`)
            .join("\n\n")}`
        : "",
      `\nAnfrage-ID: ${lead.id}`,
    ].filter(Boolean);

    const inbox = env("CONCIERGE_LEAD_INBOX") || "hello@subsum.io";
    await sendMail({
      to: inbox,
      subject: `[Website] ${KIND_LABEL[body.kind]}: ${body.name}${body.firm ? `, ${body.firm}` : ""}`,
      text: lines.join("\n"),
      replyTo: body.email,
    }).catch((err) =>
      log.error("lead notification failed", {
        leadId: lead.id,
        error: err instanceof Error ? err.message : String(err),
      })
    );

    return Response.json({ ok: true, id: lead.id });
  }
);
