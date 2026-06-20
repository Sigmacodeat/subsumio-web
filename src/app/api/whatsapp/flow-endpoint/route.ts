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
 */

import { NextRequest } from "next/server";
import { decryptFlowRequest, encryptFlowResponse, type FlowEndpointResponse } from "@/lib/whatsapp/flow-crypto";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

function generateSlots(dateStr: string): Array<{ id: string; title: string }> {
  const slots = [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  ];
  // In production, check against existing appointments in the brain
  // For now, return all slots as available
  return slots.map((time) => ({ id: `${dateStr}_${time}`, title: time }));
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
  brainId: string,
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
      // Create the case in the brain
      const caseNumber = String(data.case_number || `2026-${String(Math.floor(Math.random() * 999) + 1).padStart(3, "0")}`);
      const caseSlug = `legal/cases/${caseNumber}`;
      const clientName = String(data.client_name || "Unbekannt");
      const opponentName = String(data.opponent_name || "");
      const legalAreaId = String(data.legal_area || "civil");
      const description = String(data.description || "");

      try {
        await fetch(`${ENGINE_URL}/api/pages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...engineHeadersForBrain(brainId),
          },
          body: JSON.stringify({
            slug: caseSlug,
            title: `${clientName} vs. ${opponentName || "—"}`,
            type: "legal_case",
            content: `## Sachverhalt\n\n${description}\n\n## Parteien\n\n**Mandant:** ${clientName}\n**Gegner:** ${opponentName || "noch unbekannt"}\n\n## Rechtsgebiet\n\n${LEGAL_AREA_MAP[legalAreaId] || legalAreaId}`,
            frontmatter: {
              type: "legal_case",
              case_number: caseNumber,
              client_name: clientName,
              opponent_name: opponentName,
              legal_area: legalAreaId,
              legal_area_label: LEGAL_AREA_MAP[legalAreaId] || legalAreaId,
              status: "intake",
              created_via: "whatsapp_flow",
              created_at: new Date().toISOString(),
            },
          }),
        });
      } catch (err) {
        console.error("[flow/case-intake] brain write failed:", err instanceof Error ? err.message : String(err));
      }

      return {
        screen: "SUCCESS",
        data: {
          case_slug: caseSlug,
          case_number: caseNumber,
        },
        extension_message: {
          flow_token: flowToken,
          optional_params: { case_slug: caseSlug, case_number: caseNumber },
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
  brainId: string,
): Promise<FlowHandlerResult> {
  switch (action) {
    case "get_slots": {
      const selectedDate = String(data.selected_date || "");
      const slots = generateSlots(selectedDate);
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
      const appointmentDate = String(data.appointment_date || "");
      const appointmentTime = String(data.appointment_time || "");
      const topic = String(data.topic || "Allgemeine Beratung");
      const appointmentId = randomUUID();

      // Store appointment in brain
      try {
        await fetch(`${ENGINE_URL}/api/pages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...engineHeadersForBrain(brainId),
          },
          body: JSON.stringify({
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
          }),
        });
      } catch (err) {
        console.error("[flow/appointment] brain write failed:", err instanceof Error ? err.message : String(err));
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

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    encrypted_aes_key: string;
    encrypted_flow_data: string;
    initial_vector: string;
  };

  if (!body.encrypted_aes_key || !body.encrypted_flow_data || !body.initial_vector) {
    return Response.json({ error: "missing_encrypted_fields" }, { status: 400 });
  }

  const decrypted = decryptFlowRequest(body);
  if ("error" in decrypted) {
    return Response.json({ error: decrypted.error }, { status: 500 });
  }

  const { request, aesKey, iv } = decrypted;
  // flow_token format: "case_intake:brain_abc123" or "appointment:brain_abc123"
  // The second segment is the brainId
  const tokenParts = request.flow_token?.split(":") ?? [];
  const brainId = process.env.WHATSAPP_DEFAULT_BRAIN_ID || tokenParts[1] || "";

  console.log(`[whatsapp/flow] screen=${request.screen} action=${request.action} flow_token=${request.flow_token?.slice(0, 20)}...`);

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
        brainId,
      );
    } else if (flowType === "appointment_booking") {
      result = await handleAppointmentBooking(
        String(request.data.action || request.action),
        request.data,
        request.flow_token,
        brainId,
      );
    } else {
      result = { screen: "INTAKE_FORM", data: { legal_areas: LEGAL_AREAS } };
    }
  } catch (err) {
    console.error("[whatsapp/flow] handler error:", err instanceof Error ? err.message : String(err));
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
