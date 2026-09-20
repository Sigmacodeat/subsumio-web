// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const rendered = vi.hoisted(() => ({ text: 0 }));

vi.mock("pdfjs-dist", () => {
  class TextLayer {
    constructor(private opts: { container: HTMLElement }) {}
    async render() {
      const span = document.createElement("span");
      span.textContent = "Die Berufung ist binnen vier Wochen einzubringen.";
      this.opts.container.appendChild(span);
      rendered.text += 1;
    }
    cancel() {}
  }
  const page = (n: number) => ({
    pageNumber: n,
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
      scale,
    }),
    streamTextContent: () => new ReadableStream(),
    render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
  });
  return {
    GlobalWorkerOptions: {},
    TextLayer,
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: async (n: number) => page(n),
        destroy: async () => {},
      }),
    }),
  };
});

class IO {
  observe() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", IO);

import { DOCUMENT_TEXT_READY_EVENT, PdfDocumentViewer } from "./pdf-document-viewer";

describe("PdfDocumentViewer", () => {
  it("renders every page with a selectable text layer and says when the text is ready", async () => {
    const ready = vi.fn();
    window.addEventListener(DOCUMENT_TEXT_READY_EVENT, ready);
    render(<PdfDocumentViewer url="/api/files/doc.pdf?inline=1" title="Urteil" />);

    await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Seite 1")).toBeTruthy();
    expect(screen.getByLabelText("Seite 2")).toBeTruthy();
    expect(screen.getAllByText("Die Berufung ist binnen vier Wochen einzubringen.")).toHaveLength(
      2
    );
    expect(screen.getByText("2 Seiten")).toBeTruthy();
    expect(rendered.text).toBe(2);
  });
});
