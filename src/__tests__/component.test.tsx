import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PdfDownloadButton } from "../PdfDownloadButton.js";
import type { PdfDoc } from "../types.js";

const doc: PdfDoc = {
  title: "Test",
  blocks: [{ type: "text", text: "hello pdf" }],
};

describe("PdfDownloadButton", () => {
  beforeEach(() => {
    // jsdom lacks createObjectURL; stub the URL APIs used by the hook.
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(
      () => "blob:mock",
    );
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
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
});
