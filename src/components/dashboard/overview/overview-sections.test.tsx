import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { OverviewKpis, countLabel } from "./overview-sections";

describe("KPI-Kacheln — gekappte Zählwerte", () => {
  test("countLabel kennzeichnet Untergrenzen", () => {
    expect(countLabel(500, true)).toBe("500+");
    expect(countLabel(12, false)).toBe("12");
  });

  test("gekappte Kachel zeigt N+, nie eine exakte Gesamtzahl", () => {
    render(
      <OverviewKpis
        items={[
          {
            label: "Offene Akten",
            value: 500,
            capped: true,
            hint: "500+ Akten gesamt",
            href: "/x",
          },
          { label: "Überfällig", value: 3, hint: "", href: "/y" },
        ]}
      />
    );
    expect(screen.getByText("500+")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });
});
