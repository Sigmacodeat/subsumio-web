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
      import("@sentry/nextjs").then((Sentry) => {
        Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
      }).catch(() => {});
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return <DefaultFallback error={this.state.error} onReset={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({ error, onReset }: { error?: Error; onReset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto mb-8">
          <AlertTriangle size={26} className="text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-[#e8e8f0] mb-3">Etwas ist schiefgelaufen</h1>
        <p className="text-sm text-[#8888aa] leading-relaxed mb-6">
          Ein unerwarteter Fehler ist aufgetreten. Bitte laden Sie die Seite neu oder versuchen Sie es später erneut.
        </p>
        {error && process.env.NODE_ENV === "development" && (
          <pre className="text-xs text-left bg-[#0d0d1a] border border-[#1e1e3a] rounded-lg p-4 mb-6 overflow-auto text-red-300">
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
