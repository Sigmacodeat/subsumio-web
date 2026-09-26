import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutate = vi.fn();
let orgData: unknown = null;
vi.mock("@/lib/queries/settings", () => ({
  useOrg: () => ({ isLoading: false, data: orgData }),
  useUpdateOrg: () => ({ isPending: false, mutate }),
}));

import { DataResidencyCard } from "./data-residency-card";

beforeEach(() => mutate.mockReset());

describe("DataResidencyCard", () => {
  it("states openly that AI requests go to US providers when not EU-only", () => {
    orgData = { org: { id: "o1", modelPolicy: "any", euRouteAvailable: false }, isOwner: true };
    render(<DataResidencyCard />);
    expect(screen.getByText(/auch Anbieter in den USA/)).toBeTruthy();
    expect(screen.getByText(/Anthropic PBC in den USA/)).toBeTruthy();
    // No EU route → the owner cannot switch on a mode that would refuse every request.
    expect(screen.queryByRole("button", { name: /Nur EU-Modelle/ })).toBeNull();
  });

  it("lets the owner switch on the EU mode when an EU route exists", () => {
    orgData = { org: { id: "o1", modelPolicy: "any", euRouteAvailable: true }, isOwner: true };
    render(<DataResidencyCard />);
    fireEvent.click(screen.getByRole("button", { name: /Nur EU-Modelle verwenden/ }));
    expect(mutate.mock.calls[0]![0]).toEqual({ modelPolicy: "eu_only" });
  });

  it("shows the EU mode and hides the switch from non-owners", () => {
    orgData = { org: { id: "o1", modelPolicy: "eu_only", euRouteAvailable: true }, isOwner: false };
    render(<DataResidencyCard />);
    expect(screen.getByText("KI-Datenweg: nur EU")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("solo users without a firm still see where requests go", () => {
    orgData = { org: null };
    render(<DataResidencyCard />);
    expect(screen.getByText(/auch Anbieter in den USA/)).toBeTruthy();
  });
});
