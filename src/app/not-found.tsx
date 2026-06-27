import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { SubsumioMark } from "@/components/brand/subsumio-logo";

export default function NotFound() {
  return (
    <div
      data-tone="dark"
      className="flex min-h-screen items-center justify-center px-4 [background:var(--mk-bg)] sm:px-6 lg:px-8"
    >
      <div className="max-w-md text-center">
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/20">
          <Search size={26} className="text-[var(--brand-primary)]" />
        </div>
        <p className="mb-3 font-mono text-xs text-[var(--brand-primary)]">404</p>
        <h1 className="mb-3 text-3xl font-black [color:var(--mk-text)]">
          Even the brain doesn&apos;t know this page.
        </h1>
        <p className="mb-3 text-sm leading-relaxed [color:var(--mk-text-muted)]">
          The page you&apos;re looking for doesn&apos;t exist — and unlike your knowledge, we
          can&apos;t synthesize it from sources.
        </p>
        <p className="mb-10 text-xs [color:var(--mk-text-subtle)]">
          Diese Seite existiert nicht. Zurück zur Startseite?
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-6 py-3 text-sm font-medium text-white shadow-lg ring-1 shadow-blue-950/40 ring-[var(--brand-primary)]/30 transition-colors hover:bg-[var(--brand-primary-hover)]"
          >
            <SubsumioMark size={15} tile={false} /> Home
          </Link>
          <Link
            href="/features"
            className="inline-flex items-center gap-2 rounded-lg border [border-color:var(--mk-border)] px-6 py-3 text-sm [color:var(--mk-text-muted)] transition-colors hover:[border-color:var(--mk-border-strong)] hover:[color:var(--mk-text)]"
          >
            <ArrowLeft size={14} /> Features
          </Link>
        </div>
      </div>
    </div>
  );
}
