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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          background: "#06060f",
          color: "#e8e8f0",
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
              border: "1px solid rgba(244,63,94,0.3)",
              background: "rgba(244,63,94,0.2)",
            }}
          >
            <AlertCircle size={26} color="#fb7185" />
          </div>
          <p
            style={{
              marginBottom: "0.75rem",
              fontFamily: "monospace",
              fontSize: "0.75rem",
              color: "#fb7185",
            }}
          >
            Critical Error
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
            Something went wrong.
          </h1>
          <p
            style={{
              marginBottom: "0.75rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#8888aa",
            }}
          >
            An unexpected error occurred. Try again — or head back to safety.
          </p>
          <p style={{ marginBottom: "2.5rem", fontSize: "0.75rem", color: "#8282a6" }}>
            Ein Fehler ist aufgetreten. Zurück zur Startseite?
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                borderRadius: "0.5rem",
                background: "#2f6bff",
                padding: "0.75rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error renders own <html>, Link is not available */}
            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                borderRadius: "0.5rem",
                border: "1px solid #1e1e3a",
                padding: "0.75rem 1.5rem",
                fontSize: "0.875rem",
                color: "#8888aa",
                textDecoration: "none",
              }}
            >
              <ArrowLeft size={14} /> Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
