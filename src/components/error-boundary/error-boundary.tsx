"use client";

import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
    if (process.env.NODE_ENV === "production") {
      import("@sentry/nextjs")
        .then((Sentry) => {
          Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
        })
        .catch(() => {});
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <DefaultFallback
          error={this.state.error}
          onReset={() => this.setState({ hasError: false })}
        />
      );
    }
    return this.props.children;
  }
}

function DefaultFallback({ error, onReset }: { error?: Error; onReset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/20">
          <AlertTriangle size={26} className="text-red-400" />
        </div>
        <h1 className="mb-3 text-2xl font-bold text-[color:var(--ds-text)]">
          Etwas ist schiefgelaufen
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
          Ein unerwarteter Fehler ist aufgetreten. Bitte lade die Seite neu oder versuche es später
          erneut.
        </p>
        {error && process.env.NODE_ENV === "development" && (
          <pre className="mb-6 overflow-auto rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-left text-xs text-red-300">
            {error.stack || error.message}
          </pre>
        )}
        <Button onClick={onReset} className="gap-2">
          <RotateCcw size={16} /> Neu laden
        </Button>
      </div>
    </div>
  );
}
