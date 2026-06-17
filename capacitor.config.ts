import type { CapacitorConfig } from "@capacitor/cli";

// Sigmabrain native shell (iOS + Android) via Capacitor.
//
// Strategy: the native apps load the HOSTED web app (server.url) instead of
// bundling static assets. Why: the app is server-rendered with live API routes
// (auth, billing, brain queries) — a static bundle would be a second codebase.
// The native layer adds what the PWA can't: push notifications, biometric
// unlock, share extension. Full build guide: ../mobile/README.md
//
// For local device testing against a dev server, temporarily set:
//   server: { url: "http://<your-lan-ip>:3000", cleartext: true }

const config: CapacitorConfig = {
  appId: "com.sigmabrain.app",
  appName: "Sigmabrain",
  webDir: "public", // placeholder; remote server.url is the real source
  server: {
    url: process.env.CAP_SERVER_URL || "https://sigmabrain.com",
    allowNavigation: ["sigmabrain.com", "*.sigmabrain.com"],
  },
  backgroundColor: "#06060f",
  ios: {
    contentInset: "automatic",
    scheme: "Sigmabrain",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
