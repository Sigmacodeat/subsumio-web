import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({ addToast: vi.fn(), csrfFetch: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: m.addToast }) }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => m.csrfFetch(...a) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));

import { DocuSignSendDialog } from "./DocuSignSendDialog";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("/api/docusign/status")
        ? Response.json({ configured: true, environment: "production" })
        : new Response('{"error":"not_found"}', { status: 404 })
    )
  );
});

describe("DocuSignSendDialog", () => {
  it("does not send when a document cannot be loaded and says which one", async () => {
    render(
      <DocuSignSendDialog
        open
        onOpenChange={() => {}}
        caseTitle="Akte"
        documents={[{ name: "Vollmacht.pdf", slug: "d1", url: "/api/files/d1" }]}
      />
    );
    fireEvent.change(screen.getByLabelText("docusign.signer_email_aria"), {
      target: { value: "m@x.at" },
    });
    fireEvent.change(screen.getByLabelText("docusign.signer_name_aria"), {
      target: { value: "Max" },
    });
    const sendButton = await screen.findByRole("button", { name: "docusign.send" });
    await waitFor(() => expect(sendButton).not.toBeDisabled());
    fireEvent.click(sendButton);
    await waitFor(() => expect(m.addToast).toHaveBeenCalled());
    expect(m.csrfFetch).not.toHaveBeenCalled();
    expect(m.addToast.mock.calls[0][0].description).toContain("Vollmacht.pdf");
  });
});
