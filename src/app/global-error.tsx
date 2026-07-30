"use client";

import { useEffect } from "react";
import { ArrowLeft, AlertCircle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
    if (process.env.NODE_ENV === "production") {
      import("@sentry/nextjs")
        .then((Sentry) => {
          Sentry.captureException(error);
        })
        .catch(() => {});
    }
  }, [error]);

  return (
    <html lang="de">
      <head>
        <style>{`
          :root {
            --ge-bg: hsl(225, 20%, 7%);
            --ge-surface: hsl(225, 16%, 12%);
            --ge-text: hsl(220, 10%, 94%);
            --ge-text-muted: hsl(220, 8%, 78%);
            --ge-text-subtle: hsl(220, 8%, 74%);
            --ge-danger: hsl(0, 60%, 65%);
            --ge-danger-border: hsla(0, 60%, 65%, 0.3);
            --ge-danger-bg: hsla(0, 60%, 65%, 0.15);
            --ge-brand: hsl(230, 45%, 55%);
            --ge-border: hsl(225, 12%, 24%);
            --ge-radius: 0.625rem;
          }
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          background: "var(--ge-bg)",
          color: "var(--ge-text)",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <div
            style={{
              margin: "0 auto 2rem",
              width: "4rem",
              height: "4rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "1rem",
              border: "1px solid var(--ge-danger-border)",
              background: "var(--ge-danger-bg)",
            }}
          >
            <AlertCircle size={26} color="var(--ge-danger)" />
          </div>
          <p
            style={{
              marginBottom: "0.75rem",
              fontFamily: "monospace",
              fontSize: "0.75rem",
              color: "var(--ge-danger)",
            }}
          >
            Kritischer Fehler
          </p>
          <h1
            style={{
              marginBottom: "0.75rem",
              fontSize: "clamp(1.75rem,4vw,2.25rem)",
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1.12,
            }}
          >
            Es ist ein Fehler aufgetreten.
          </h1>
          <p
            style={{
              marginBottom: "0.75rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "var(--ge-text-muted)",
            }}
          >
            Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut oder kehren Sie
            zur Startseite zurück.
          </p>
          {error.digest && (
            <p
              style={{
                marginBottom: "2.5rem",
                fontSize: "0.75rem",
                color: "var(--ge-text-subtle)",
                fontFamily: "monospace",
              }}
            >
              Fehler-ID: {error.digest}
            </p>
          )}
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              marginTop: error.digest ? 0 : "2.5rem",
            }}
          >
            <button
              onClick={reset}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                borderRadius: "var(--ge-radius)",
                background: "var(--ge-brand)",
                padding: "0.75rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Erneut versuchen
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error renders own <html>, Link is not available */}
            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                borderRadius: "var(--ge-radius)",
                border: "1px solid var(--ge-border)",
                padding: "0.75rem 1.5rem",
                fontSize: "0.875rem",
                color: "var(--ge-text-muted)",
                textDecoration: "none",
              }}
            >
              <ArrowLeft size={14} /> Zur Startseite
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
