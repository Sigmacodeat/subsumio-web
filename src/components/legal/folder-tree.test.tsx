import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderTree, FOLDER_DND_MIME } from "@/components/legal/folder-tree";
import { buildFolderTree } from "@/lib/folder-tree";

const labels = {
  all: "Alle Ordner",
  unfiled: "Ohne Ordner",
  heading: "Ordner",
  menu: "Ordner-Aktionen",
  rename: "Umbenennen",
  newSubfolder: "Neuer Unterordner",
};

const PATHS = ["Korrespondenz", "Korrespondenz/Ausgehend", "Verträge"];
const COUNTS = { Korrespondenz: 2, "Korrespondenz/Ausgehend": 3, Verträge: 1 };

function renderTree(
  selected = "all",
  onSelect = vi.fn(),
  extra: Partial<Parameters<typeof FolderTree>[0]> = {}
) {
  const nodes = buildFolderTree(PATHS, COUNTS);
  render(
    <FolderTree
      nodes={nodes}
      selected={selected}
      onSelect={onSelect}
      labels={labels}
      unfiledCount={4}
      totalCount={10}
      {...extra}
    />
  );
  return onSelect;
}

function makeDataTransfer() {
  const store: Record<string, string> = {};
  return {
    types: [FOLDER_DND_MIME],
    effectAllowed: "",
    dropEffect: "",
    setData: (t: string, v: string) => {
      store[t] = v;
    },
    getData: (t: string) => store[t] ?? "",
  };
}

describe("FolderTree", () => {
  beforeEach(() => localStorage.clear());

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

  it("persists collapsed state to localStorage under persistKey", async () => {
    const { unmount } = render(
      <FolderTree
        nodes={buildFolderTree(PATHS, COUNTS)}
        selected="all"
        onSelect={vi.fn()}
        labels={labels}
        unfiledCount={0}
        totalCount={0}
        persistKey="case-x"
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /Zuklappen: Korrespondenz/ }));
    expect(localStorage.getItem("subsumio:folder-collapsed:case-x")).toContain("Korrespondenz");
    unmount();
    // Remount: collapsed state restored → Ausgehend stays hidden
    render(
      <FolderTree
        nodes={buildFolderTree(PATHS, COUNTS)}
        selected="all"
        onSelect={vi.fn()}
        labels={labels}
        unfiledCount={0}
        totalCount={0}
        persistKey="case-x"
      />
    );
    expect(screen.queryByText("Ausgehend")).toBeNull();
  });

  it("calls onDropDocument with slug + folder path on drop", () => {
    const onDrop = vi.fn();
    renderTree("all", vi.fn(), { onDropDocument: onDrop });
    const dt = makeDataTransfer();
    dt.setData(FOLDER_DND_MIME, "legal/documents/vertrag-1");
    const row = screen.getByText("Korrespondenz").closest("button")!;
    fireEvent.dragOver(row, { dataTransfer: dt });
    fireEvent.drop(row, { dataTransfer: dt });
    expect(onDrop).toHaveBeenCalledWith("legal/documents/vertrag-1", "Korrespondenz");
  });

  it("drops on „Ohne Ordner“ to unfile a document", () => {
    const onDrop = vi.fn();
    renderTree("all", vi.fn(), { onDropDocument: onDrop });
    const dt = makeDataTransfer();
    dt.setData(FOLDER_DND_MIME, "legal/documents/x");
    const row = screen.getByText("Ohne Ordner").closest("button")!;
    fireEvent.drop(row, { dataTransfer: dt });
    expect(onDrop).toHaveBeenCalledWith("legal/documents/x", "");
  });

  it("ignores drops with foreign dataTransfer types", () => {
    const onDrop = vi.fn();
    renderTree("all", vi.fn(), { onDropDocument: onDrop });
    const dt = { ...makeDataTransfer(), types: ["text/plain"] };
    const row = screen.getByText("Verträge").closest("button")!;
    fireEvent.dragOver(row, { dataTransfer: dt });
    fireEvent.drop(row, { dataTransfer: dt });
    // drop still fires (no preventDefault gate on drop), but the handler
    // reads our MIME → empty string → no callback
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("opens the context menu via the ⋯ button and fires rename", async () => {
    const onRename = vi.fn();
    renderTree("all", vi.fn(), { onRenameFolder: onRename });
    await userEvent.click(screen.getByRole("button", { name: "Ordner-Aktionen: Verträge" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Umbenennen/ }));
    expect(onRename).toHaveBeenCalledWith("Verträge");
  });

  it("fires create-subfolder from the context menu", async () => {
    const onCreate = vi.fn();
    renderTree("all", vi.fn(), { onCreateSubfolder: onCreate });
    await userEvent.click(screen.getByRole("button", { name: "Ordner-Aktionen: Korrespondenz" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Neuer Unterordner/ }));
    expect(onCreate).toHaveBeenCalledWith("Korrespondenz");
  });

  it("hides the menu trigger when no menu handlers are given", () => {
    renderTree();
    expect(screen.queryByRole("button", { name: /Ordner-Aktionen/ })).toBeNull();
  });
});
