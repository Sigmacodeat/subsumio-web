import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/ai-release-client", () => ({
  requestAiRelease: vi.fn(),
}));

import { AiReleasePanel } from "./AiReleasePanel";
import { requestAiRelease } from "@/lib/ai-release-client";

beforeEach(() => vi.mocked(requestAiRelease).mockReset());

describe("AiReleasePanel", () => {
  it("guides check → release and hands the token to the page", async () => {
    vi.mocked(requestAiRelease).mockResolvedValue({
      kind: "released",
      token: "tok",
      summary: {
        state: "VERIFIED",
        citations_verified: 1,
        citations_unverified: 0,
        warning: null,
        override_required: false,
      },
      releasedBy: "ra@kanzlei.at",
    });
    const onReleased = vi.fn();
    render(<AiReleasePanel content="Text" released={null} onReleased={onReleased} />);
    expect(screen.getByText(/1\. Zitate prüfen/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Prüfen und freigeben/ }));
    await waitFor(() => expect(onReleased).toHaveBeenCalledWith("tok", "ra@kanzlei.at", undefined));
  });

  it("asks for a reason when citations are unverified and sends it", async () => {
    vi.mocked(requestAiRelease)
      .mockResolvedValueOnce({
        kind: "reason_required",
        message: "",
        summary: {
          state: "NEEDS_HUMAN_REVIEW",
          citations_verified: 1,
          citations_unverified: 2,
          warning: null,
          override_required: true,
        },
      })
      .mockResolvedValueOnce({
        kind: "released",
        token: "tok2",
        summary: {
          state: "NEEDS_HUMAN_REVIEW",
          citations_verified: 1,
          citations_unverified: 2,
          warning: null,
          override_required: true,
        },
      });
    const onReleased = vi.fn();
    render(<AiReleasePanel content="Text" released={null} onReleased={onReleased} />);
    fireEvent.click(screen.getByRole("button", { name: /Prüfen und freigeben/ }));
    const reason = await screen.findByLabelText("Begründung der Freigabe");
    expect(screen.getByText(/2 von 3 Zitat/)).toBeTruthy();
    const button = screen.getByRole("button", { name: /Mit Begründung freigeben/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(reason, { target: { value: "Zitate händisch im RIS geprüft" } });
    fireEvent.click(button);
    await waitFor(() =>
      expect(onReleased).toHaveBeenCalledWith("tok2", undefined, "Zitate händisch im RIS geprüft")
    );
    expect(vi.mocked(requestAiRelease).mock.calls[1]![0].overrideReason).toBe(
      "Zitate händisch im RIS geprüft"
    );
  });

  it("explains when the user may not release", async () => {
    vi.mocked(requestAiRelease).mockResolvedValue({
      kind: "forbidden",
      message: "Nur Anwält:innen",
    });
    render(<AiReleasePanel content="Text" released={null} onReleased={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Prüfen und freigeben/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Nur Anwält:innen");
  });

  it("shows the released state", () => {
    render(<AiReleasePanel content="Text" released="tok" onReleased={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("anwaltlich freigegeben");
  });
});
