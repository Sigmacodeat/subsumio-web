import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PortalSummaryEditor } from "@/components/legal/PortalSummaryEditor";

describe("PortalSummaryEditor", () => {
  it("renders nothing for roles that may not release portal text", () => {
    const { container } = render(
      <PortalSummaryEditor value="x" canEdit={false} lang="de" onSave={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("tells the lawyer the client sees the text and saves the trimmed summary", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<PortalSummaryEditor value="" canEdit lang="de" onSave={onSave} />);
    expect(screen.getByText(/Der Mandant sieht genau diesen Text/)).toBeTruthy();
    fireEvent.change(
      screen.getByLabelText("Für das Mandantenportal freigegebene Zusammenfassung"),
      { target: { value: "  Kurzer Sachstand  " } }
    );
    fireEvent.click(screen.getByRole("button", { name: /Für Portal freigeben/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("Kurzer Sachstand"));
  });
});
