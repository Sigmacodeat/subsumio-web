/**
 * WhatsApp Flows Data Endpoint
 *
 * This endpoint receives encrypted data_exchange requests from WhatsApp
 * Flows, decrypts them, processes the business logic (case creation,
 * appointment booking), and returns encrypted responses.
 *
 * The endpoint URL must be registered with Meta when creating a Flow
 * via the Flows API. Meta sends POST requests with encrypted payloads.
 *
 * Env vars:
 * - WHATSAPP_FLOW_PRIVATE_KEY_PEM: RSA private key in PEM format
 * - WHATSAPP_APP_SECRET: app secret for the X-Hub-Signature-256 check
 */

import { createWebhookHandler, apiError } from "@/lib/api-handler";
import {
  decryptFlowRequest,
  encryptFlowResponse,
  type FlowEndpointResponse,
} from "@/lib/whatsapp/flow-crypto";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { createCaseSafely, engineCaseCreateDeps } from "@/lib/safe-case-create";
import { buildIntakeRequest, writeIntakeRequest } from "@/lib/intake";
import { verifyWhatsAppSignature } from "@/lib/whatsapp/verify";
import { randomUUID } from "node:crypto";
import { clientIp } from "@/lib/auth/rate-limit";
import { sanitizeObjectStrings } from "@/lib/prompt-sanitizer";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

import { logger } from "@/lib/logger";
const log = logger("api/whatsapp/flow-endpoint");

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const flowRequestSchema = z.object({
  encrypted_aes_key: z.string(),
  encrypted_flow_data: z.string(),
  initial_vector: z.string(),
});

const BRAIN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_FIELD_LENGTH = 500;

// ── Static data for dropdowns ──────────────────────────────────────────────

const LEGAL_AREAS = [
  { id: "family", title: "Familienrecht" },
  { id: "civil", title: "Zivilrecht" },
  { id: "criminal", title: "Strafrecht" },
  { id: "labor", title: "Arbeitsrecht" },
  { id: "commercial", title: "Handelsrecht" },
  { id: "tax", title: "Steuerrecht" },
  { id: "administrative", title: "Verwaltungsrecht" },
  { id: "ip", title: "Gewerblicher Rechtsschutz" },
];

const LEGAL_AREA_MAP = Object.fromEntries(LEGAL_AREAS.map((a) => [a.id, a.title]));

// ── Available appointment slots (generated dynamically) ────────────────────

const ALL_SLOT_TIMES = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
];

/**
 * Times already booked for a given date, across confirmed appointments in
 * this brain. Used to both filter the slot picker (get_slots) and to
 * re-verify at write time (book_appointment) that the slot the person
 * picked wasn't taken by someone else in between — the picker alone is a
 * TOCTOU race, not an enforced hold.
 */
async function getBookedTimes(brainId: string, dateStr: string): Promise<Set<string>> {
  const pages = await listEnginePages(engineHeadersForBrain(brainId), "appointment", 500);
  const booked = new Set<string>();
  for (const page of pages) {
    const fm = page.frontmatter ?? {};
    if (fm.date === dateStr && fm.status !== "cancelled") {
      const time = String(fm.time ?? "");
      if (time) booked.add(time);
    }
  }
  return booked;
}

async function generateSlots(
  dateStr: string,
  brainId: string
): Promise<Array<{ id: string; title: string }>> {
  let booked: Set<string>;
  try {
    booked = await getBookedTimes(brainId, dateStr);
  } catch (err) {
    // Fail closed on availability, not open: if we can't confirm what's
    // booked, don't offer slots we can't vouch for. get_slots() will just
    // come back empty for this date rather than risk a double-booking.
    log.error(
      "[flow/appointment] getBookedTimes failed, returning no slots:",
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
  return ALL_SLOT_TIMES.filter((time) => !booked.has(time)).map((time) => ({
    id: `${dateStr}_${time}`,
    title: time,
  }));
}

// ── Flow handlers ──────────────────────────────────────────────────────────

interface FlowHandlerResult {
  screen: string;
  data: Record<string, unknown>;
  extension_message?: { flow_token: string; optional_params?: Record<string, unknown> };
}

async function handleCaseIntake(
  action: string,
  data: Record<string, unknown>,
  flowToken: string,
  brainId: string
): Promise<FlowHandlerResult> {
  switch (action) {
    case "review_intake": {
      const legalAreaId = String(data.legal_area || "");
      return {
        screen: "REVIEW",
        data: {
          client_name: data.client_name,
          opponent_name: data.opponent_name || "",
          legal_area: legalAreaId,
          legal_area_label: LEGAL_AREA_MAP[legalAreaId] || legalAreaId,
          description: data.description,
          case_number: data.case_number || "",
        },
      };
    }
    case "create_case": {
      // The slug and the Aktenzeichen are assigned here, never taken from the
      // sender: a sender-chosen value could name an existing matter, and a
      // plain create would replace it. What the sender typed as their own
      // reference is kept as a note only.
      const reference = `WA-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const senderReference = String(data.case_number || "").slice(0, 100);
      const clientName = String(data.client_name || "Unbekannt").slice(0, MAX_FIELD_LENGTH);
      const opponentName = String(data.opponent_name || "").slice(0, MAX_FIELD_LENGTH);
      const legalAreaId = String(data.legal_area || "civil").slice(0, 50);
      const description = String(data.description || "").slice(0, 5000);
      const legalAreaLabel = LEGAL_AREA_MAP[legalAreaId] || legalAreaId;

      const casePayload = sanitizeObjectStrings({
        title: `${clientName} vs. ${opponentName || "—"}`,
        content: `## Sachverhalt\n\n${description}\n\n## Parteien\n\n**Mandant:** ${clientName}\n**Gegner:** ${opponentName || "noch unbekannt"}\n\n## Rechtsgebiet\n\n${legalAreaLabel}`,
        frontmatter: {
          type: "legal_case",
          case_number: reference,
          ...(senderReference ? { client_reference: senderReference } : {}),
          client_name: clientName,
          opponent_name: opponentName,
          legal_area: legalAreaId,
          legal_area_label: legalAreaLabel,
          status: "intake",
          created_via: "whatsapp_flow",
          created_at: new Date().toISOString(),
        },
      });

      const headers = engineHeadersForBrain(brainId);
      const outcome = await createCaseSafely(engineCaseCreateDeps(headers), {
        ...casePayload,
        slugHint: reference,
      });

      if (outcome.status === "conflict") {
        // No matter for a conflicting request. The firm reviews it as an
        // intake request; the sender is not told about the conflict.
        const intake = buildIntakeRequest({
          source: "whatsapp",
          summary: description || `Anfrage von ${clientName}`,
          clientName,
          legalArea: legalAreaLabel,
          status: "new",
          conflictCheckStatus: "conflict",
        });
        await writeIntakeRequest(brainId, {
          ...intake,
          frontmatter: {
            ...intake.frontmatter,
            ...(opponentName ? { opponent: opponentName } : {}),
            intake_reference: reference,
          } as typeof intake.frontmatter,
        });
        void logAudit("whatsapp.flow_case_created", "intake_request", {
          entityId: intake.slug,
          details: { brainId, reference, legalArea: legalAreaId, conflict: true },
        });
        return {
          screen: "SUCCESS",
          data: { case_slug: "", case_number: reference },
          extension_message: {
            flow_token: flowToken,
            optional_params: { case_number: reference },
          },
        };
      }

      if (outcome.status !== "created") {
        // exists / error: nothing was written — never report SUCCESS.
        log.error("[flow/case-intake] case not created:", outcome.status);
        throw new Error(`case_create_failed:${outcome.status}`);
      }

      void logAudit("whatsapp.flow_case_created", "legal_case", {
        entityId: outcome.slug,
        details: { brainId, reference, legalArea: legalAreaId },
      });

      return {
        screen: "SUCCESS",
        data: {
          case_slug: outcome.slug,
          case_number: reference,
        },
        extension_message: {
          flow_token: flowToken,
          optional_params: { case_slug: outcome.slug, case_number: reference },
        },
      };
    }
    default:
      return {
        screen: "INTAKE_FORM",
        data: { legal_areas: LEGAL_AREAS },
      };
  }
}

async function handleAppointmentBooking(
  action: string,
  data: Record<string, unknown>,
  flowToken: string,
  brainId: string
): Promise<FlowHandlerResult> {
  switch (action) {
    case "get_slots": {
      const selectedDate = String(data.selected_date || "");
      const slots = await generateSlots(selectedDate, brainId);
      return {
        screen: "DATE_SELECT",
        data: {
          selected_date: selectedDate,
          available_slots: slots,
        },
      };
    }
    case "review_appointment": {
      const selectedDate = String(data.selected_date || "");
      const slotId = String(data.selected_slot || "");
      const time = slotId.split("_").pop() || "";
      return {
        screen: "CONFIRM",
        data: {
          appointment_date: selectedDate,
          appointment_time: time,
          topic: data.topic || "Allgemeine Beratung",
        },
      };
    }
    case "book_appointment": {
      const appointmentDate = String(data.appointment_date || "").slice(0, 20);
      const appointmentTime = String(data.appointment_time || "").slice(0, 20);
      const topic = String(data.topic || "Allgemeine Beratung").slice(0, MAX_FIELD_LENGTH);
      // Re-verify the slot is still free right before writing — the picker
      // shown to the user (get_slots) is a snapshot, not a hold, so two
      // people booking the same date concurrently could otherwise both
      // land on "confirmed" for the same time.
      const stillBooked = await getBookedTimes(brainId, appointmentDate).catch(() => null);
      if (stillBooked === null || stillBooked.has(appointmentTime)) {
        const freshSlots = await generateSlots(appointmentDate, brainId);
        return {
          screen: "DATE_SELECT",
          data: {
            selected_date: appointmentDate,
            available_slots: freshSlots,
            error: "slot_taken",
          },
        };
      }

      const appointmentId = randomUUID();

      const apptPayload = sanitizeObjectStrings({
        slug: `legal/appointments/${appointmentId}`,
        title: `Termin: ${appointmentDate} ${appointmentTime} — ${topic}`,
        type: "appointment",
        content: `## Termin\n\n**Datum:** ${appointmentDate}\n**Uhrzeit:** ${appointmentTime}\n**Thema:** ${topic}\n**Quelle:** WhatsApp Flow\n\n### Erinnerung\n\n24h vor dem Termin wird eine Erinnerung gesendet.`,
        frontmatter: {
          type: "appointment",
          appointment_id: appointmentId,
          date: appointmentDate,
          time: appointmentTime,
          topic,
          status: "confirmed",
          created_via: "whatsapp_flow",
          created_at: new Date().toISOString(),
        },
      });

      try {
        await fetch(`${ENGINE_URL}/api/pages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...engineHeadersForBrain(brainId),
          },
          body: JSON.stringify(apptPayload),
          signal: AbortSignal.timeout(15_000),
        });
        void logAudit("whatsapp.flow_appointment_booked", "appointment", {
          entityId: appointmentId,
          details: { brainId, date: appointmentDate, time: appointmentTime },
        });
      } catch (err) {
        log.error(
          "[flow/appointment] brain write failed:",
          err instanceof Error ? err.message : String(err)
        );
      }

      return {
        screen: "SUCCESS",
        data: {
          appointment_id: appointmentId,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
        },
        extension_message: {
          flow_token: flowToken,
          optional_params: { appointment_id: appointmentId },
        },
      };
    }
    default:
      return {
        screen: "DATE_SELECT",
        data: {},
      };
  }
}

// ── Route Handler ──────────────────────────────────────────────────────────

export const POST = createWebhookHandler(
  {
    rateLimitKey: (req) => `whatsapp-flow:ip:${clientIp(req.headers)}`,
    rateLimitMax: 30,
    rateLimitWindowMs: 60_000,
  },
  async (_body, req) => {
    // Only Meta may call this endpoint: every request carries an HMAC of the
    // raw body made with the app secret (X-Hub-Signature-256), checked like
    // the webhook. No secret or a wrong signature → rejected (fail closed).
    const rawBody = await req.text();
    if (!verifyWhatsAppSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
      return apiError("invalid_signature", "Invalid request signature", 401);
    }
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return apiError("invalid_json", "Request body is not valid JSON", 400);
    }
    const parsedBody = flowRequestSchema.safeParse(json);
    if (!parsedBody.success) {
      return apiError("validation_failed", "Request body validation failed", 400);
    }
    const { encrypted_aes_key, encrypted_flow_data, initial_vector } = parsedBody.data;

    const decrypted = decryptFlowRequest({
      encrypted_aes_key,
      encrypted_flow_data,
      initial_vector,
    });
    if ("error" in decrypted) {
      return apiError("decryption_failed", "Failed to decrypt flow request", 500);
    }

    const { request, aesKey, iv } = decrypted;
    // flow_token format: "case_intake:brain_abc123" or "appointment:brain_abc123"
    // The second segment is the brainId.
    //
    // Security: WHATSAPP_DEFAULT_BRAIN_ID is the only trusted source for the
    // brainId. The flow_token is user-visible metadata round-tripped through
    // WhatsApp and must NOT be trusted for tenant routing — a crafted token
    // could target another tenant's brain. If the env var is unset, reject
    // rather than falling back to the untrusted token.
    const tokenParts = request.flow_token?.split(":") ?? [];
    const rawBrainId = process.env.WHATSAPP_DEFAULT_BRAIN_ID || "";

    if (!rawBrainId || !BRAIN_ID_PATTERN.test(rawBrainId)) {
      return apiError("flow_endpoint_not_configured", "Flow endpoint not configured", 503);
    }
    const brainId = rawBrainId;

    // Determine which flow this is based on the flow_token prefix
    const flowType = tokenParts[0] === "appointment" ? "appointment_booking" : "case_intake";

    // Handle INIT action — return the first screen with initial data
    if (request.action === "INIT") {
      const initialResponse: FlowEndpointResponse = {
        version: "3.0",
        screen: flowType === "appointment_booking" ? "DATE_SELECT" : "INTAKE_FORM",
        data: flowType === "case_intake" ? { legal_areas: LEGAL_AREAS } : {},
      };
      const encryptedResponse = encryptFlowResponse(initialResponse, aesKey, iv);
      return new Response(encryptedResponse, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    let result: FlowHandlerResult;

    try {
      if (flowType === "case_intake") {
        result = await handleCaseIntake(
          String(request.data.action || request.action),
          request.data,
          request.flow_token,
          brainId
        );
      } else if (flowType === "appointment_booking") {
        result = await handleAppointmentBooking(
          String(request.data.action || request.action),
          request.data,
          request.flow_token,
          brainId
        );
      } else {
        result = { screen: "INTAKE_FORM", data: { legal_areas: LEGAL_AREAS } };
      }
    } catch (err) {
      log.error("[whatsapp/flow] handler error:", err instanceof Error ? err.message : String(err));
      result = {
        screen: request.screen,
        data: { ...request.data, error: "processing_failed" },
      };
    }

    const response: FlowEndpointResponse = {
      version: "3.0",
      screen: result.screen,
      data: result.data,
      ...(result.extension_message ? { extension_message: result.extension_message } : {}),
    };

    const encryptedResponse = encryptFlowResponse(response, aesKey, iv);

    return new Response(encryptedResponse, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
);
