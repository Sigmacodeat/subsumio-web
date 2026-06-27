import { createPublicHandler } from "@/lib/api-handler";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import { z } from "zod";

const DATA_DIR = path.join(process.cwd(), ".data");
const MAILBOX_FILE = path.join(DATA_DIR, "mailbox.json");

const devEmailSchema = z.object({
  from: z.string().optional(),
  to: z.union([z.string(), z.array(z.string())]).optional(),
  subject: z.string().optional(),
  text: z.string().nullable().optional(),
  html: z.string().nullable().optional(),
  headers: z.record(z.string()).optional(),
});

async function persist(email: Record<string, unknown>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let messages: unknown[] = [];
  try {
    const raw = await fs.readFile(MAILBOX_FILE, "utf8");
    messages = JSON.parse(raw);
  } catch {
    // file missing or corrupt — start fresh
  }
  if (!Array.isArray(messages)) messages = [];
  messages.unshift(email);
  const tmp = `${MAILBOX_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(messages, null, 2), "utf8");
  await fs.rename(tmp, MAILBOX_FILE);
}

function parseAddress(input: string | undefined): { email: string; name: string | null } {
  const raw = (input ?? "").trim();
  const angle = raw.match(/^(.*?)<([^>]+)>$/);
  if (angle)
    return {
      name: angle[1].trim().replace(/^"|"$/g, "") || null,
      email: angle[2].trim().toLowerCase(),
    };
  return { email: raw.toLowerCase(), name: null };
}

export const POST = createPublicHandler(
  {
    body: devEmailSchema,
  },
  async (_req, body) => {
    // Dev-only: reject in production unless explicitly allowed
    if (process.env.NODE_ENV === "production" && env("SUBSUMIO_ALLOW_DEV_CATCH") !== "true") {
      return Response.json({ ok: false, error: "dev_only" }, { status: 403 });
    }

    const from = parseAddress(body.from);
    const toRaw = Array.isArray(body.to) ? body.to : typeof body.to === "string" ? [body.to] : [];
    const toEmails = toRaw.map((e) => e.trim().toLowerCase()).filter(Boolean);

    const now = new Date().toISOString();
    // Full MailMessage shape so the production-grade reader in
    // src/lib/email/mailbox.ts (used by /admin/mailbox + the API) renders dev
    // emails with the correct direction/status.
    const email = {
      id: randomUUID(),
      providerId: null,
      direction: "inbound" as const,
      status: "received" as const,
      fromEmail: from.email || "unknown",
      fromName: from.name,
      toEmails,
      ccEmails: [] as string[],
      bccEmails: [] as string[],
      subject: String(body.subject ?? "").trim(),
      text: typeof body.text === "string" ? body.text : null,
      html: typeof body.html === "string" ? body.html : null,
      messageId: null,
      inReplyTo: null,
      userId: null,
      brainId: null,
      raw: { source: "dev-catch", headers: body.headers ?? {} },
      createdAt: now,
      updatedAt: now,
    };

    await persist(email);
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[dev-catch] email received: ${email.id}`);
    }

    return Response.json({ ok: true, id: email.id });
  }
);
