export default function Loading() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[color:var(--brand-primary)]" />
    </div>
  );
}

import { Loader2 } from "lucide-react";
