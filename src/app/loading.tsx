import { SubsumioMark } from "@/components/brand/subsumio-logo";

export default function Loading() {
  return (
    <div
      data-tone="dark"
      className="flex min-h-screen items-center justify-center [background:var(--mk-bg)]"
    >
      <div className="flex flex-col items-center gap-4">
        <SubsumioMark size={48} className="animate-pulse" />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)]/30 border-t-[var(--brand-primary)]" />
      </div>
    </div>
  );
}
