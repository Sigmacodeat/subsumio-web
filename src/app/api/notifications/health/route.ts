import { createHandler, apiSuccess } from "@/lib/api-handler";
import { loadKanzleiSettings } from "@/lib/kanzlei-settings";

export const dynamic = "force-dynamic";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (_ctx) => {
    const settings = await loadKanzleiSettings();
    const smtpConfigured = !!(settings.smtpHost && settings.smtpUser && settings.smtpPassword);
    const whatsappConfigured = !!(
      process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN
    );
    const pushConfigured = !!(process.env.APNS_TEAM_ID || process.env.FCM_SERVER_KEY);

    const channels: Array<{
      channel: string;
      configured: boolean;
      detail?: string;
    }> = [
      {
        channel: "email",
        configured: smtpConfigured,
        detail: smtpConfigured
          ? undefined
          : "SMTP nicht konfiguriert — Fristen-Erinnerungen werden nur im Dashboard angezeigt",
      },
      {
        channel: "whatsapp",
        configured: whatsappConfigured,
        detail: whatsappConfigured ? undefined : "WhatsApp Business API nicht konfiguriert",
      },
      {
        channel: "push",
        configured: pushConfigured,
        detail: pushConfigured
          ? undefined
          : "Push-Benachrichtigungen nicht konfiguriert (APNs/FCM)",
      },
    ];

    const allConfigured = smtpConfigured; // Email is the critical channel
    const anyConfigured = smtpConfigured || whatsappConfigured || pushConfigured;

    return apiSuccess({
      channels,
      all_configured: allConfigured,
      any_configured: anyConfigured,
    });
  }
);
