// @vitest-environment jsdom

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const csrfFetch = vi.fn();
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...a) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));

import { DmsConfigPanel } from "./DmsConfigPanel";

const stored = {
  provider: "imanager",
  baseUrl: "https://dms.example.com",
  hasApiKey: true,
  sharepointSiteId: null,
  sharepointDriveId: null,
  boxFolderId: null,
  updatedAt: "2026-09-25T10:00:00.000Z",
};

describe("DmsConfigPanel", () => {
  beforeEach(() => csrfFetch.mockReset());

  test("shows a load error with retry", async () => {
    csrfFetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    render(<DmsConfigPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/nicht geladen/);
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });

  test("an existing connection shows no key and saving keeps it (empty key field)", async () => {
    csrfFetch.mockResolvedValueOnce(Response.json({ data: { config: stored } }));
    render(<DmsConfigPanel />);
    expect(await screen.findByText("Eingerichtet")).toBeInTheDocument();
    const keyField = screen.getByPlaceholderText(/gespeichert/) as HTMLInputElement;
    expect(keyField.value).toBe("");
    expect(keyField.type).toBe("password");

    csrfFetch.mockResolvedValueOnce(Response.json({ data: { config: stored } }));
    fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    await waitFor(() => expect(csrfFetch).toHaveBeenCalledTimes(2));
    const [url, init] = csrfFetch.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/dms/config");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toMatchObject({
      provider: "imanager",
      baseUrl: "https://dms.example.com",
      apiKey: null,
    });
  });

  test("a server error on save is shown in German", async () => {
    csrfFetch.mockResolvedValueOnce(Response.json({ data: { config: null } }));
    render(<DmsConfigPanel />);
    const url = await screen.findByPlaceholderText(/imanage/);
    fireEvent.change(url, { target: { value: "https://dms.example.com" } });
    fireEvent.change(screen.getByLabelText(/API-Schlüssel/), { target: { value: "k" } });
    csrfFetch.mockResolvedValueOnce(
      Response.json({ error: "Die DMS-Adresse muss mit https:// beginnen." }, { status: 400 })
    );
    fireEvent.click(screen.getByRole("button", { name: "DMS verbinden" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("https://");
  });
});
