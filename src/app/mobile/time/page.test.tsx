import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MobileTimePage from "./page";

const listAllPages = vi.fn();
const createPage = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      listAllPages: (...a: unknown[]) => listAllPages(...a),
      createPage: (...a: unknown[]) => createPage(...a),
    },
  },
}));
const csrfFetch = vi.fn();
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...a) }));
const online = vi.fn(() => true);
const enqueueMutation = vi.fn();
vi.mock("@/lib/offline-store", () => ({
  isOnline: () => online(),
  enqueueMutation: (...a: unknown[]) => enqueueMutation(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  online.mockReturnValue(true);
  listAllPages.mockResolvedValue([
    {
      slug: "cases/a",
      title: "Akte A",
      type: "legal_case",
      frontmatter: { type: "legal_case", status: "open" },
    },
  ]);
});

async function manualEntry(minutes: string) {
  render(<MobileTimePage />);
  fireEvent.click(screen.getByRole("button", { name: "Manuell" }));
  fireEvent.change(screen.getByPlaceholderText("00"), { target: { value: minutes } });
  fireEvent.change(screen.getByPlaceholderText("Beschreibung der Tätigkeit…"), {
    target: { value: "Telefonat" },
  });
  await screen.findByRole("option", { name: "Akte A" });
}

describe("mobile time tracking", () => {
  it("cannot save without a matter and never writes a fallback page", async () => {
    await manualEntry("30");
    const save = screen.getByRole("button", { name: /speichern/ });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(csrfFetch).not.toHaveBeenCalled();
    expect(createPage).not.toHaveBeenCalled();
  });

  it("books through /api/time with matter slug, minutes and billable", async () => {
    csrfFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    await manualEntry("30");
    fireEvent.change(screen.getByRole("combobox", { name: "Akte" }), {
      target: { value: "cases/a" },
    });
    fireEvent.click(screen.getByRole("button", { name: /speichern/ }));
    await waitFor(() => expect(csrfFetch).toHaveBeenCalled());
    const [url, init] = csrfFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/time");
    expect(JSON.parse(String(init.body))).toMatchObject({
      case_slug: "cases/a",
      minutes: 30,
      billable: true,
      description: "Telefonat",
    });
    expect(createPage).not.toHaveBeenCalled();
  });

  it("shows the server's refusal instead of reporting success", async () => {
    csrfFetch.mockResolvedValue(
      Response.json({ error: "Akte nicht gefunden", code: "case_not_found" }, { status: 404 })
    );
    await manualEntry("30");
    fireEvent.change(screen.getByRole("combobox", { name: "Akte" }), {
      target: { value: "cases/a" },
    });
    fireEvent.click(screen.getByRole("button", { name: /speichern/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Akte nicht gefunden");
    expect(createPage).not.toHaveBeenCalled();
  });

  it("offline, queues the same /api/time entry for later", async () => {
    online.mockReturnValue(false);
    await manualEntry("15");
    fireEvent.change(screen.getByRole("combobox", { name: "Akte" }), {
      target: { value: "cases/a" },
    });
    fireEvent.click(screen.getByRole("button", { name: /speichern/ }));
    await waitFor(() => expect(enqueueMutation).toHaveBeenCalled());
    expect(enqueueMutation.mock.calls[0][0]).toMatchObject({
      type: "createTimeEntry",
      payload: { case_slug: "cases/a", minutes: 15, billable: true },
    });
    expect(csrfFetch).not.toHaveBeenCalled();
  });
});
