"use client";

import { Suspense } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useSearchParams } from "next/navigation";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-6" />}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const caseSlug = searchParams.get("case") ?? undefined;
  const pageSlug = searchParams.get("page") ?? undefined;
  const initialQuery = searchParams.get("q") ?? undefined;
  const initialSessionId = searchParams.get("session") ?? undefined;
  const contextType = caseSlug ? "case" : pageSlug ? "brain_page" : "global";

  return (
    <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col p-4 md:p-6 lg:p-8">
      <ChatPanel
        context={{ type: contextType, caseSlug, pageSlug }}
        initialQuery={initialQuery}
        initialSessionId={initialSessionId}
        className="flex-1"
      />
    </div>
  );
}
