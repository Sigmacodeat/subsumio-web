import type { CapacitorConfig } from "@capacitor/cli";

// Subsumio native shell (iOS + Android) via Capacitor.
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
  appId: "io.subsum.app",
  appName: "Subsumio",
  webDir: "public", // placeholder; remote server.url is the real source
  server: {
    url: process.env.CAP_SERVER_URL || "https://subsum.io",
    allowNavigation: ["subsum.io", "*.subsum.io"],
  },
  backgroundColor: "#06060f",
  ios: {
    contentInset: "automatic",
    scheme: "Subsumio",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
