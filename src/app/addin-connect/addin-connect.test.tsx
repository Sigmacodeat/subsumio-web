/**
 * Office add-in sign-in dialog page: issues the add-in token only inside
 * Office and only after confirmation, hands it to the task pane restricted to
 * this origin, and never shows it.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const csrfFetch = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/csrf", () => ({
  csrfFetch: (input: string | URL, init?: RequestInit) => csrfFetch(input, init),
}));

import { AddinConnect, type OfficeDialogApi } from "./addin-connect";

const EXPIRES = "2099-01-02T08:00:00.000Z";

function officeWith(messageParent: (m: string, o?: { targetOrigin: string }) => void) {
  const office: OfficeDialogApi = {
    onReady: async () => undefined,
    context: { ui: { messageParent } },
  };
  return async () => office;
}

beforeEach(() => {
  csrfFetch.mockReset();
});

describe("/addin-connect", () => {
  it("outside Office it issues nothing", async () => {
    render(<AddinConnect client="word" loadOffice={async () => null} />);
    expect(await screen.findByText(/Außerhalb von Office wird kein Zugang erstellt/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(csrfFetch).not.toHaveBeenCalled();
  });

  it("an unknown add-in cannot request a token", async () => {
    const messageParent = vi.fn();
    render(<AddinConnect client={null} loadOffice={officeWith(messageParent)} />);
    expect(await screen.findByText(/Unbekanntes Add-in/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(csrfFetch).not.toHaveBeenCalled();
  });

  it("after confirmation issues the add-in's token and hands it to this origin only", async () => {
    const messageParent = vi.fn();
    csrfFetch.mockResolvedValue(
      Response.json({ token: "sk_addin_secret", expires_at: EXPIRES, scopes: ["write"] })
    );
    render(<AddinConnect client="outlook" loadOffice={officeWith(messageParent)} />);
    const button = await screen.findByRole("button", { name: /Outlook verbinden/ });
    expect(csrfFetch).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(messageParent).toHaveBeenCalledTimes(1));

    expect(csrfFetch).toHaveBeenCalledWith(
      "/api/addin-token",
      expect.objectContaining({ method: "POST" })
    );
    expect(JSON.parse(String(csrfFetch.mock.calls[0][1]?.body))).toEqual({ client: "outlook" });
    const [msg, opts] = messageParent.mock.calls[0] as [string, { targetOrigin: string }];
    expect(JSON.parse(msg)).toEqual({
      type: "subsumio-addin-token",
      client: "outlook",
      token: "sk_addin_secret",
      expires_at: EXPIRES,
    });
    expect(opts).toEqual({ targetOrigin: window.location.origin });
    expect(await screen.findByText(/Verbunden/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("sk_addin_secret");
  });

  it("a refused request passes nothing to the add-in", async () => {
    const messageParent = vi.fn();
    csrfFetch.mockResolvedValue(Response.json({ error: "Nicht angemeldet" }, { status: 401 }));
    render(<AddinConnect client="word" loadOffice={officeWith(messageParent)} />);
    fireEvent.click(await screen.findByRole("button", { name: /Word verbinden/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(messageParent).not.toHaveBeenCalled();
  });
});
