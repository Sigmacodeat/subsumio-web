import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DocumentInterviewsPage from "./page";

const apiGet = vi.fn();
const csrfFetch = vi.fn();
const addToast = vi.fn();

vi.mock("@/lib/api", () => ({ api: { get: (...a: unknown[]) => apiGet(...a) } }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...a) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k }) }));
vi.mock("@/components/dashboard/page-header", () => ({
  PageHeader: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div>,
}));
vi.mock("@/components/dashboard/primary-action", () => ({
  PrimaryAction: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

describe("Dokumenten-Interviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGet.mockResolvedValue({ data: { items: [] } });
    csrfFetch.mockResolvedValue(Response.json({ data: { interview: {} } }));
  });

  it("creates an interview with its questions through the CSRF-protected call", async () => {
    render(<DocumentInterviewsPage />);
    await userEvent.click(await screen.findByText("interview.new"));
    await userEvent.type(screen.getByLabelText("interview.title_label *"), "Scheidung");
    await userEvent.type(screen.getByLabelText("interview.template_slug *"), "templates/scheidung");
    await userEvent.type(screen.getByLabelText("Frage 1"), "Name der Mandantin");
    await userEvent.click(screen.getByText("interview.save"));

    expect(csrfFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(csrfFetch.mock.calls[0]![1].body));
    expect(body.questions).toEqual([
      expect.objectContaining({ label: "Name der Mandantin", variable: "name_der_mandantin" }),
    ]);
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });

  it("a failing save is shown as an error with the server text", async () => {
    csrfFetch.mockResolvedValue(
      Response.json({ error: "Das Interview konnte nicht gespeichert werden" }, { status: 502 })
    );
    render(<DocumentInterviewsPage />);
    await userEvent.click(await screen.findByText("interview.new"));
    await userEvent.type(screen.getByLabelText("interview.title_label *"), "X");
    await userEvent.type(screen.getByLabelText("interview.template_slug *"), "t/x");
    await userEvent.type(screen.getByLabelText("Frage 1"), "Frage");
    await userEvent.click(screen.getByText("interview.save"));
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        description: "Das Interview konnte nicht gespeichert werden",
      })
    );
  });
});
