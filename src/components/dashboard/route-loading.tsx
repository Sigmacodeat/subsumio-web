import { Loader2 } from "lucide-react";

export default function RouteLoading() {
  return (
    <div className="flex min-h-[320px] items-center justify-center p-8" role="status">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
