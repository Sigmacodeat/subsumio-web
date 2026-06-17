import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { SigmaMark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#06060f] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-8">
          <Search size={26} className="text-violet-400" />
        </div>
        <p className="text-xs font-mono text-violet-400 mb-3">404</p>
        <h1 className="text-3xl font-black text-[#e8e8f0] mb-3">
          Even the brain doesn&apos;t know this page.
        </h1>
        <p className="text-sm text-[#8888aa] leading-relaxed mb-3">
          The page you&apos;re looking for doesn&apos;t exist — and unlike your knowledge,
          we can&apos;t synthesize it from sources.
        </p>
        <p className="text-xs text-[#7878a0] mb-10">
          Diese Seite existiert nicht. Zurück zur Startseite?
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-6 py-3 rounded-lg shadow-lg shadow-violet-900/40 ring-1 ring-violet-500/30 transition-colors"
          >
            <SigmaMark size={15} tile={false} /> Home
          </Link>
          <Link
            href="/features"
            className="inline-flex items-center gap-2 text-sm text-[#8888aa] hover:text-[#e8e8f0] border border-[#1e1e3a] hover:border-[#3a3a6a] px-6 py-3 rounded-lg transition-colors"
          >
            <ArrowLeft size={14} /> Features
          </Link>
        </div>
      </div>
    </div>
  );
}
