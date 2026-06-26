"use client";

import { ModelComparison } from "@/components/chat/model-comparison";

export default function ModelComparisonPage() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <ModelComparison />
    </div>
  );
}
