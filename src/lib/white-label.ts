/**
 * White-Label PWA Configuration
 * ==============================
 * Per-firm PWA manifest generation from kanzlei settings.
 * Portal as installable PWA with firm-specific logo, colors, and name.
 */

export interface WhiteLabelConfig {
  firm_name: string;
  firm_short_name?: string;
  firm_description?: string;
  logo_url?: string;
  icon_192_url?: string;
  icon_512_url?: string;
  theme_color: string;
  background_color: string;
  start_url: string;
}

export const DEFAULT_WHITE_LABEL: WhiteLabelConfig = {
  firm_name: "Subsumio",
  firm_short_name: "Subsumio",
  firm_description:
    "Kanzlei-OS für Akten, Fristen, Eingang, Dokumente, Abrechnung und zitierte KI-Antworten.",
  theme_color: "#06060f",
  background_color: "#06060f",
  start_url: "/dashboard",
};

export function generateWhiteLabelManifest(config: WhiteLabelConfig): Record<string, unknown> {
  return {
    name: config.firm_name,
    short_name: config.firm_short_name ?? config.firm_name.slice(0, 12),
    description: config.firm_description ?? DEFAULT_WHITE_LABEL.firm_description,
    start_url: config.start_url,
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: config.background_color,
    theme_color: config.theme_color,
    categories: ["business", "productivity"],
    icons: [
      { src: config.icon_192_url ?? "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: config.icon_512_url ?? "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: config.icon_512_url ?? "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

export function whiteLabelFromKanzleiSettings(settings: {
  firm_name?: string;
  logo_url?: string;
  theme_color?: string;
  background_color?: string;
}): WhiteLabelConfig {
  return {
    ...DEFAULT_WHITE_LABEL,
    firm_name: settings.firm_name ?? DEFAULT_WHITE_LABEL.firm_name,
    logo_url: settings.logo_url,
    icon_192_url: settings.logo_url,
    icon_512_url: settings.logo_url,
    theme_color: settings.theme_color ?? DEFAULT_WHITE_LABEL.theme_color,
    background_color: settings.background_color ?? DEFAULT_WHITE_LABEL.background_color,
  };
}
