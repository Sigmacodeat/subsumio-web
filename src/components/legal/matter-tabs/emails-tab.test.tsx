import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
vi.mock("@/lib/matter-detail-context", () => ({
  useMatterDetail: () => ({
    caseData: {
      slug: "cases/mueller",
      caseNumber: "3 Cg 12/26",
      documents: [
        {
          id: "doc-1",
          name: "E-Mail: Vergleichsangebot",
          type: "email",
          uploadedAt: "2026-09-01T10:00:00Z",
          notes: "Von: gegner@example.com",
        },
      ],
    },
  }),
}));
const addToast = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
const csrfFetch = vi.fn();
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...args: unknown[]) => csrfFetch(...args) }));

import { EmailsTab } from "./emails-tab";

const filedMail = {
  id: "m1",
  direction: "inbound",
  status: "received",
  fromEmail: "mandant@example.com",
  fromName: "Maria Mandantin",
  toEmails: ["hello+org_a@subsum.io"],
  subject: "Unterlagen zur Klage",
  text: null,
  html: '<p>Anbei die Unterlagen.</p><script>window.__pwned = true</script><img src=x onerror="window.__pwned=true">',
  caseSlug: "cases/mueller",
  createdAt: "2026-09-10T08:00:00Z",
  isRead: true,
};
const unassignedMail = {
  ...filedMail,
  id: "m2",
  subject: "Neue Anfrage",
  html: null,
  text: "Bitte um Rückruf",
  caseSlug: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  delete (window as unknown as { __pwned?: boolean }).__pwned;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("case=")) {
        return new Response(
          JSON.stringify({ messages: [filedMail], address: "hello+org_a@subsum.io" }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ messages: [filedMail, unassignedMail] }), {
        status: 200,
      });
    })
  );
  csrfFetch.mockResolvedValue(
    new Response(JSON.stringify({ message: { status: "sent" } }), { status: 200 })
  );
});

describe("EmailsTab", () => {
  it("lists filed mail, unassigned inbound mail, Outlook imports and the firm address", async () => {
    render(<EmailsTab />);
    expect(await screen.findByText("Unterlagen zur Klage")).toBeInTheDocument();
    expect(screen.getByText("Neue Anfrage")).toBeInTheDocument();
    expect(screen.getByText("Vergleichsangebot")).toBeInTheDocument();
    expect(screen.getByText("hello+org_a@subsum.io")).toBeInTheDocument();
  });

  it("renders HTML mail as plain text only", async () => {
    const { container } = render(<EmailsTab />);
    fireEvent.click(await screen.findByText("Unterlagen zur Klage"));
    expect(await screen.findByText(/Anbei die Unterlagen\./)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it("files unassigned mail to the matter", async () => {
    render(<EmailsTab />);
    fireEvent.click(await screen.findByText("Neue Anfrage"));
    fireEvent.click(await screen.findByText("Dieser Akte zuordnen"));
    await waitFor(() => expect(csrfFetch).toHaveBeenCalled());
    const [url, init] = csrfFetch.mock.calls[0];
    expect(url).toBe("/api/email/messages/m2");
    expect(JSON.parse(init.body)).toEqual({ case_slug: "cases/mueller" });
  });

  it("prefills a reply to the sender with a quoted original", async () => {
    render(<EmailsTab />);
    fireEvent.click(await screen.findByText("Neue Anfrage"));
    fireEvent.click(await screen.findByText("Antworten"));
    expect(screen.getByLabelText("An")).toHaveValue("mandant@example.com");
    expect(screen.getByLabelText("Betreff")).toHaveValue("Re: Neue Anfrage");
    expect((screen.getByLabelText("Nachricht") as HTMLTextAreaElement).value).toContain(
      "> Bitte um Rückruf"
    );

    fireEvent.click(screen.getByText("Senden"));
    await waitFor(() =>
      expect(csrfFetch).toHaveBeenCalledWith(
        "/api/email/messages/m2/reply",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("starts new mail with the case number in the subject and files it to the matter", async () => {
    render(<EmailsTab />);
    fireEvent.click(await screen.findByText("Neue E-Mail"));
    expect(screen.getByLabelText("Betreff")).toHaveValue("[3 Cg 12/26] ");
    fireEvent.change(screen.getByLabelText("An"), { target: { value: "gegner@example.com" } });
    fireEvent.change(screen.getByLabelText("Betreff"), { target: { value: "[3 Cg 12/26] Frist" } });
    fireEvent.change(screen.getByLabelText("Nachricht"), { target: { value: "Sehr geehrte …" } });
    fireEvent.click(screen.getByText("Senden"));
    await waitFor(() => expect(csrfFetch).toHaveBeenCalled());
    const [url, init] = csrfFetch.mock.calls[0];
    expect(url).toBe("/api/email/messages");
    expect(JSON.parse(init.body)).toMatchObject({
      to: ["gegner@example.com"],
      case_slug: "cases/mueller",
    });
  });
});
