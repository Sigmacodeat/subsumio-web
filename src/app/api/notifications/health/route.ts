import { createHandler, apiSuccess } from "@/lib/api-handler";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";

export const dynamic = "force-dynamic";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx) => {
    const settings = await loadKanzleiSettingsForBrain(ctx.brainId).catch(() => null);
    const smtpConfigured = !!(settings?.smtpHost && settings.smtpUser && settings.smtpPassword);
    const whatsappConfigured = !!(
      process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN
    );
    const pushConfigured = !!(process.env.APNS_TEAM_ID || process.env.FCM_SERVICE_ACCOUNT_PATH);

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
          : settings
            ? "SMTP nicht konfiguriert — Fristen-Erinnerungen werden nur im Dashboard angezeigt"
            : "Kanzlei-Einstellungen derzeit nicht lesbar — SMTP-Status unbekannt",
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
