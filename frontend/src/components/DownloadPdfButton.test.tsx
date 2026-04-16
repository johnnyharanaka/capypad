import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DownloadPdfButton from "./DownloadPdfButton";

const mocks = vi.hoisted(() => {
  const markedParseMock = vi.fn(async (input: string) => input);
  const sanitizeMock = vi.fn((input: string) => input);
  const html2canvasMock = vi.fn(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 860;
    canvas.height = 400;
    canvas.toDataURL = vi.fn(
      () => "data:image/png;base64,abc",
    ) as unknown as typeof canvas.toDataURL;
    return canvas;
  });
  const pdfInstances: Array<{
    addPage: ReturnType<typeof vi.fn>;
    addImage: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    internal: { pageSize: { getHeight: () => number } };
  }> = [];
  const jsPDFMock = vi.fn(function jsPDFMockImpl() {
    const instance = {
      internal: { pageSize: { getHeight: () => 297 } },
      addPage: vi.fn(),
      addImage: vi.fn(),
      save: vi.fn(),
    };
    pdfInstances.push(instance);
    return instance;
  });
  return {
    markedParseMock,
    sanitizeMock,
    html2canvasMock,
    jsPDFMock,
    pdfInstances,
  };
});

vi.mock("marked", () => ({
  marked: {
    parse: mocks.markedParseMock,
  },
}));

vi.mock("dompurify", () => ({
  default: {
    sanitize: mocks.sanitizeMock,
  },
}));

vi.mock("katex", () => ({
  default: {
    renderToString: vi.fn((tex: string) => `<span>${tex}</span>`),
  },
}));

vi.mock("html2canvas-pro", () => ({
  default: mocks.html2canvasMock,
}));

vi.mock("jspdf", () => ({
  jsPDF: mocks.jsPDFMock,
}));

describe("DownloadPdfButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pdfInstances.length = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        headers: { get: () => null },
        blob: async () => new Blob(["x"], { type: "image/png" }),
      }),
    );

    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() },
    });

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function mockRect(this: HTMLElement): DOMRect {
        const parsedW = Number.parseInt(this.style.width || "", 10);
        const parsedH = Number.parseInt(this.style.height || "", 10);

        const width = Number.isFinite(parsedW)
          ? parsedW
          : this.classList.contains("cm-content")
            ? 860
            : this.tagName === "IMG"
              ? 320
              : 800;
        const height = Number.isFinite(parsedH)
          ? parsedH
          : this.tagName === "IMG"
            ? 500
            : 1200;

        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: width,
          bottom: height,
          width,
          height,
          toJSON: () => ({}),
        } as DOMRect;
      },
    );

    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function mockScrollHeight(this: HTMLElement): number {
        const parsed = Number.parseInt(this.style.height || "", 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1200;
      },
    );

    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("normaliza newline escapado e salva o PDF", async () => {
    render(<DownloadPdfButton content={"linha1\\nlinha2"} padPath="demo" />);

    await userEvent.click(
      screen.getByRole("button", { name: /download as pdf/i }),
    );

    await waitFor(() => {
      expect(mocks.pdfInstances.at(-1)?.save).toHaveBeenCalledWith("demo.pdf");
    });

    const parsedInput = String(mocks.markedParseMock.mock.calls[0]?.[0] ?? "");
    expect(parsedInput).toContain("linha1\nlinha2");
    expect(parsedInput).not.toContain("\\n");
  });

  it("mantem estilo de imagem igual ao editor para default e resized", async () => {
    const content = "\\image[abc]\\n\\image[def|320]";
    render(<DownloadPdfButton content={content} padPath="img-style" />);

    await userEvent.click(
      screen.getByRole("button", { name: /download as pdf/i }),
    );

    await waitFor(() => {
      expect(mocks.pdfInstances.at(-1)?.save).toHaveBeenCalledWith(
        "img-style.pdf",
      );
    });

    const parsedInput = String(mocks.markedParseMock.mock.calls[0]?.[0] ?? "");
    expect(parsedInput).toContain("max-height:500px");
    expect(parsedInput).toContain("width:320px;max-width:100%;max-height:none");
  });

  it("usa largura de referencia do DOM do editor na captura", async () => {
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    const content = document.createElement("div");
    content.className = "cm-content";
    editor.appendChild(content);
    document.body.appendChild(editor);

    render(<DownloadPdfButton content={"texto"} padPath="dom-width" />);

    await userEvent.click(
      screen.getByRole("button", { name: /download as pdf/i }),
    );

    await waitFor(() => {
      expect(mocks.pdfInstances.at(-1)?.save).toHaveBeenCalledWith(
        "dom-width.pdf",
      );
    });

    const firstCall = mocks.html2canvasMock.mock.calls[0] as
      | unknown[]
      | undefined;
    const firstCallOptions = firstCall?.[1] as { width?: number } | undefined;
    expect(firstCallOptions?.width).toBe(860);
  });
});
