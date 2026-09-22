import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderTree } from "@/components/legal/folder-tree";
import { buildFolderTree } from "@/lib/folder-tree";

const labels = { all: "Alle Ordner", unfiled: "Ohne Ordner", heading: "Ordner" };

function renderTree(selected = "all", onSelect = vi.fn()) {
  const nodes = buildFolderTree(["Korrespondenz", "Korrespondenz/Ausgehend", "Verträge"], {
    Korrespondenz: 2,
    "Korrespondenz/Ausgehend": 3,
    Verträge: 1,
  });
  render(
    <FolderTree
      nodes={nodes}
      selected={selected}
      onSelect={onSelect}
      labels={labels}
      unfiledCount={4}
      totalCount={10}
    />
  );
  return onSelect;
}

describe("FolderTree", () => {
  it("renders all/unfiled rows and folder nodes", () => {
    renderTree();
    expect(screen.getByText("Alle Ordner")).toBeTruthy();
    expect(screen.getByText("Ohne Ordner")).toBeTruthy();
    expect(screen.getByText("Korrespondenz")).toBeTruthy();
    expect(screen.getByText("Ausgehend")).toBeTruthy();
    expect(screen.getByText("Verträge")).toBeTruthy();
  });

  it("shows aggregated counts (parent includes children)", () => {
    renderTree();
    // Korrespondenz: 2 + 3 = 5; Verträge: 1; Alle: 10; Ohne Ordner: 4
    const korr = screen.getByText("Korrespondenz").closest("button")!;
    expect(korr.textContent).toContain("5");
    const alle = screen.getByText("Alle Ordner").closest("button")!;
    expect(alle.textContent).toContain("10");
  });

  it("calls onSelect with the node path on click", async () => {
    const onSelect = renderTree();
    await userEvent.click(screen.getByText("Ausgehend"));
    expect(onSelect).toHaveBeenCalledWith("Korrespondenz/Ausgehend");
    await userEvent.click(screen.getByText("Ohne Ordner"));
    expect(onSelect).toHaveBeenCalledWith("");
    await userEvent.click(screen.getByText("Alle Ordner"));
    expect(onSelect).toHaveBeenCalledWith("all");
  });

  it("collapses and re-expands children via the chevron", async () => {
    renderTree();
    const toggle = screen.getByRole("button", { name: /Zuklappen: Korrespondenz/ });
    await userEvent.click(toggle);
    expect(screen.queryByText("Ausgehend")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Aufklappen: Korrespondenz/ }));
    expect(screen.getByText("Ausgehend")).toBeTruthy();
  });

  it("marks the selected node via aria-pressed", () => {
    renderTree("Verträge");
    const vertraege = screen.getByText("Verträge").closest("button")!;
    expect(vertraege.getAttribute("aria-pressed")).toBe("true");
    const alle = screen.getByText("Alle Ordner").closest("button")!;
    expect(alle.getAttribute("aria-pressed")).toBe("false");
  });
});
