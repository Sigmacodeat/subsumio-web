"use client";

import { ChatPanel } from "@/components/chat/chat-panel";
import { useSearchParams } from "next/navigation";

export default function ChatPage() {
  const searchParams = useSearchParams();
  const caseSlug = searchParams.get("case") ?? undefined;
  const pageSlug = searchParams.get("page") ?? undefined;
  const initialQuery = searchParams.get("q") ?? undefined;
  const contextType = caseSlug ? "case" : pageSlug ? "brain_page" : "global";

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col">
      <ChatPanel
        context={{ type: contextType, caseSlug, pageSlug }}
        initialQuery={initialQuery}
        className="flex-1"
      />
    </div>
  );
}
