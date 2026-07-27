import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  );
}
