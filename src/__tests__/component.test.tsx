import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook, screen, fireEvent, act } from "@testing-library/react";
import { PdfDownloadButton } from "../PdfDownloadButton.js";
import { usePdfDownload } from "../usePdfDownload.js";
import type { PdfDoc } from "../types.js";

const doc: PdfDoc = {
  title: "Test",
  blocks: [{ type: "text", text: "hello pdf" }],
};

const stubUrlApis = (): void => {
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(
    () => "blob:mock",
  );
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
};

describe("PdfDownloadButton", () => {
  beforeEach(() => {
    stubUrlApis();
  });

  it("renders default label", () => {
    render(<PdfDownloadButton doc={doc} />);
    expect(screen.getByRole("button")).toHaveTextContent("Download PDF");
  });

  it("renders custom children", () => {
    render(<PdfDownloadButton doc={doc}>Save invoice</PdfDownloadButton>);
    expect(screen.getByRole("button")).toHaveTextContent("Save invoice");
  });

  it("triggers a download and fires onDownloaded on click", () => {
    const onDownloaded = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<PdfDownloadButton doc={doc} filename="x.pdf" onDownloaded={onDownloaded} />);
    fireEvent.click(screen.getByRole("button"));

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(onDownloaded).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it("respects the disabled prop", () => {
    render(
      <PdfDownloadButton doc={doc} disabled>
        Nope
      </PdfDownloadButton>,
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("forwards aria-label and arbitrary button attributes", () => {
    render(<PdfDownloadButton doc={doc} aria-label="Export" data-testid="dl" className="btn" />);
    const btn = screen.getByTestId("dl");
    expect(btn).toHaveAttribute("aria-label", "Export");
    expect(btn).toHaveClass("btn");
  });

  it("has type=button so it never submits a surrounding form", () => {
    render(<PdfDownloadButton doc={doc} />);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("sets aria-busy to false when idle", () => {
    render(<PdfDownloadButton doc={doc} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "false");
  });

  it("calls onError when generation fails", () => {
    const onError = vi.fn();
    // Force createObjectURL to throw so the hook records an error.
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(() => {
      throw new Error("boom");
    });
    render(<PdfDownloadButton doc={doc} onError={onError} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});

describe("usePdfDownload", () => {
  beforeEach(() => {
    stubUrlApis();
  });

  it("produces a PDF blob from a document", () => {
    const { result } = renderHook(() => usePdfDownload());
    const blob = result.current.toBlob(doc);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("starts idle with no error", () => {
    const { result } = renderHook(() => usePdfDownload());
    expect(result.current.generating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("records an error when download fails", () => {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(() => {
      throw new Error("nope");
    });
    const { result } = renderHook(() => usePdfDownload());
    act(() => {
      result.current.download(doc);
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("nope");
  });

  it("triggers an anchor click on download", () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { result } = renderHook(() => usePdfDownload());
    act(() => {
      result.current.download(doc, "report.pdf");
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });
});
