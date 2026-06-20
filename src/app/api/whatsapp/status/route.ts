
import { loadAllowedSenders } from "@/lib/whatsapp/verify";
import { createHandler } from "@/lib/api-handler";

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
  },
  async (_ctx, _body, _query, _req) => {
    const allowed = loadAllowedSenders();
    return Response.json({
      configured: Boolean(
        process.env.WHATSAPP_VERIFY_TOKEN &&
        process.env.WHATSAPP_ACCESS_TOKEN &&
        process.env.WHATSAPP_PHONE_NUMBER_ID &&
        allowed.length > 0,
      ),
      verifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
      appSecret: Boolean(process.env.WHATSAPP_APP_SECRET),
      accessToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
      phoneNumberId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
      mediaStorageProvider: process.env.WHATSAPP_MEDIA_STORAGE_PROVIDER || (process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local"),
      mediaStorageDir: process.env.WHATSAPP_MEDIA_STORAGE_DIR || ".data/whatsapp-media",
      mediaMaxBytes: Number(process.env.WHATSAPP_MEDIA_MAX_BYTES || 25 * 1024 * 1024),
      blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      transcriptionEnabled: Boolean(process.env.OPENAI_API_KEY),
      transcriptionModel: process.env.WHATSAPP_TRANSCRIPTION_MODEL || "whisper-1",
      transcriptionLanguage: process.env.WHATSAPP_TRANSCRIPTION_LANGUAGE || "de",
      dedupProvider: Boolean(process.env.AUTH_DB_URL) ? "postgres" : "memory",
      flowEndpointConfigured: Boolean(process.env.WHATSAPP_FLOW_PRIVATE_KEY_PEM),
      flowEndpointUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/whatsapp/flow-endpoint`,
      allowedSenders: allowed.map((sender) => ({
        brainId: sender.brainId,
        userId: sender.userId,
        name: sender.name,
        role: sender.role,
        phoneLast4: sender.phone.slice(-4),
      })),
      webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/whatsapp/webhook`,
    });
  },
);
