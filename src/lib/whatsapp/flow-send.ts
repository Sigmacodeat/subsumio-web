/**
 * WhatsApp Flow Send — send a Flow message to a recipient
 *
 * Sends an interactive message with type "flow" via the Cloud API.
 * The Flow must be created and registered with Meta first (via Flows API).
 *
 * For client-side flows (no endpoint), the Flow JSON is sent directly.
 * For server-side flows, only the flow_token, flow_name/flow_id, and
 * initial screen data are needed.
 */

import { withRetry } from "@/lib/retry";

function graphVersion(): string {
  return process.env.WHATSAPP_GRAPH_VERSION || "v20.0";
}

export interface SendFlowOptions {
  to: string;
  flowToken: string;
  flowName?: string;
  flowId?: string;
  flowCta: string;
  headerText?: string;
  bodyText: string;
  footerText?: string;
  initialScreen?: string;
  initialData?: Record<string, unknown>;
}

export async function sendWhatsAppFlow(opts: SendFlowOptions): Promise<{ messageId: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error("WhatsApp not configured");

  const parameters: Record<string, unknown> = {
    flow_message_version: "3",
    flow_token: opts.flowToken,
    flow_cta: opts.flowCta,
    flow_action: "navigate",
    flow_action_payload: {
      screen: opts.initialScreen || "INTAKE_FORM",
      data: opts.initialData || {},
    },
  };

  if (opts.flowName) parameters.flow_name = opts.flowName;
  if (opts.flowId) parameters.flow_id = opts.flowId;

  const interactive: Record<string, unknown> = {
    type: "flow",
    body: { text: opts.bodyText },
    action: {
      name: "flow",
      parameters,
    },
  };

  if (opts.headerText) {
    interactive.header = { type: "text", text: opts.headerText };
  }
  if (opts.footerText) {
    interactive.footer = { text: opts.footerText };
  }

  const res = await withRetry(() =>
    fetch(
      `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: opts.to.replace(/^\+/, ""),
          type: "interactive",
          interactive,
        }),
      }
    )
  );

  if (!res.ok) {
    const error = await res.text().catch(() => "");
    throw new Error(error || `WhatsApp Flow send failed: HTTP ${res.status}`);
  }

  const data = (await res.json().catch(() => ({}))) as { messages?: Array<{ id?: string }> };
  return { messageId: data.messages?.[0]?.id ?? "" };
}
