import { SubsumioMark } from "@/components/brand/subsumio-logo";

export default function Loading() {
  return (
    <div data-tone="dark" className="min-h-screen bg-[#06060f] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <SubsumioMark size={48} className="animate-pulse" />
        <div className="w-8 h-8 border-2 border-[var(--brand-primary)]/30 border-t-[var(--brand-primary)] rounded-full animate-spin" />
      </div>
    </div>
  );
}
