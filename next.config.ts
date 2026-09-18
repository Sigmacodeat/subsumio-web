import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // Allows CI/verification jobs to build concurrently without corrupting .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // TODO: Re-enable lint during build once the 25k pre-existing ESLint issues
  // (mostly a11y and TypeScript) are resolved in a dedicated lint sprint.
  // TypeScript build errors remain enforced below.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Type-checking runs in `bun run verify` (tsc --noEmit) and CI — running it
  // again inside every production build roughly doubles the build time on
  // this codebase. Skip it here; type errors still fail the verify gate.
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [],
    formats: ["image/avif", "image/webp"],
  },
  productionBrowserSourceMaps: false,
  // All metadata in this app resolves synchronously (static content objects),
  // so blocking metadata is free — and guarantees description/og:/twitter:
  // tags land inside <head> for EVERY consumer: search crawlers, link
  // unfurlers (Slack/Telegram/WhatsApp etc.), and Lighthouse. Next 15
  // otherwise streams metadata after </head> for non-bot user agents.
  htmlLimitedBots: /.*/i,
  async redirects() {
    return [
      // Austria-only pilot: canonical public product and security pages.
      { source: "/subsumio", destination: "/at", permanent: true },
      { source: "/at/subsumio", destination: "/at", permanent: true },
      { source: "/produkt", destination: "/at", permanent: true },
      { source: "/sicherheit", destination: "/at/security", permanent: true },
      // Consolidated Kanzlei routes — one canonical law-firms solution page.
      { source: "/kanzlei", destination: "/at/solutions/law-firms", permanent: true },
      { source: "/at/kanzlei", destination: "/at/solutions/law-firms", permanent: true },
      // Content trees canonicalised under /at — root variants are legacy.
      { source: "/blog", destination: "/at/blog", permanent: true },
      { source: "/blog/:path*", destination: "/at/blog/:path*", permanent: true },
      { source: "/cities", destination: "/at/cities", permanent: true },
      { source: "/cities/:path*", destination: "/at/cities/:path*", permanent: true },
      {
        source: "/benchmark-methodology",
        destination: "/at/benchmark-methodology",
        permanent: true,
      },
      { source: "/solutions/mid-sized", destination: "/at/solutions/law-firms", permanent: true },
      {
        source: "/at/solutions/mid-sized",
        destination: "/at/solutions/law-firms",
        permanent: true,
      },
      // Removed dashboard routes (IA consolidation) — keep old bookmarks alive
      { source: "/dashboard/assistant", destination: "/dashboard/chat", permanent: true },
      { source: "/dashboard/query", destination: "/dashboard/brain", permanent: true },
      // TODO 11: Recherche-Hub — old routes redirect to unified hub with tab facet
      {
        source: "/dashboard/rechtsprechung",
        destination: "/dashboard/research?tab=rechtsprechung",
        permanent: true,
      },
      {
        source: "/dashboard/norms",
        destination: "/dashboard/research?tab=normen",
        permanent: true,
      },
      {
        source: "/dashboard/judgements-db",
        destination: "/dashboard/research?tab=judgements-db",
        permanent: true,
      },
      {
        source: "/dashboard/precedent-search",
        destination: "/dashboard/research?tab=precedent-search",
        permanent: true,
      },
      {
        source: "/dashboard/commentaries",
        destination: "/dashboard/research?tab=commentaries",
        permanent: true,
      },
      {
        source: "/dashboard/time-tracking",
        destination: "/dashboard/time",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          // CSP is set per-request in middleware with a cryptographic nonce
          // to eliminate 'unsafe-inline' from script-src.
        ],
      },
    ];
  },
  experimental: {
    reactCompiler: false,
    // This application has hundreds of routes. Keep Webpack's peak memory
    // bounded during production compilation (supported since Next.js 15).
    webpackMemoryOptimizations: true,
    webpackBuildWorker: true,
    serverSourceMaps: false,
    optimizePackageImports: ["lucide-react", "framer-motion", "date-fns", "radash"],
    // In Next 15.5 these options both live under `experimental`. The web upload
    // route is matched by middleware, while Server Actions use their own limit.
    serverActions: {
      bodySizeLimit: "1gb",
    },
    middlewareClientMaxBodySize: "1gb",
  },
  serverExternalPackages: ["pg", "isomorphic-dompurify", "ioredis"],
  // The legal corpus lives in the repo but is only ever ingested into Postgres —
  // no route reads it from disk at runtime. File tracing is therefore disabled
  // to avoid scanning the ~772k files (18 GB) under law-corpus/ and server/,
  // which OOMs at 8 GB (node::fs::AfterScanDir). Re-enable with `output: 'standalone'`
  // and validated `outputFileTracingExcludes` once the deployment setup requires it.
  // Both forms of each pattern: relative to the tracing root and anywhere in the
  // tree. Tracing stays off (see above), so these only matter if it is enabled.
  outputFileTracingExcludes: {
    "*": [
      "server/**",
      "tests/**",
      "backups/**",
      "law-corpus/**",
      "docs/**",
      "scripts/**",
      "evals/**",
      "research/**",
      "mobile/**",
      "plugins/**",
      "tools/**",
      "outlook-addin/**",
      "word-addin/**",
      "test-results/**",
      "coverage/**",
      "storybook-static/**",
      ".next-e2e/**",
      ".next-standalone/**",
      "**/law-corpus/**",
      "**/server/**",
      "**/.source-registry-diff/**",
      "**/evals/**",
      "**/research/**",
      "**/.claude/**",
      "**/.git/**",
      "**/tests/**",
      "**/test-results/**",
      "**/docs/**",
      "**/scripts/**",
      "**/tools/**",
      "**/outlook-addin/**",
      "**/word-addin/**",
      "**/mobile/**",
      "**/plugins/**",
      "**/tmp/**",
    ],
  },
  outputFileTracingIncludes: {
    "*": ["./src/lib/corpus-meta.json"],
  },
};

export default withBundleAnalyzer(nextConfig);
