/**
 * A ready-to-use button that downloads a {@link PdfDoc} when clicked.
 */

import * as React from "react";
import type { PdfDoc } from "./types.js";
import { usePdfDownload } from "./usePdfDownload.js";

export interface PdfDownloadButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "onError"> {
  /** The document to generate when the button is clicked. */
  doc: PdfDoc;
  /** Download filename. Defaults to "document.pdf". */
  filename?: string;
  /** Button label. Defaults to "Download PDF". */
  children?: React.ReactNode;
  /** Label shown (and announced) while the PDF is being generated. */
  generatingLabel?: React.ReactNode;
  /** Called after a successful download is triggered. */
  onDownloaded?: () => void;
  /** Called if generation fails. */
  onError?: (error: Error) => void;
}

/**
 * Renders a `<button>` that generates and downloads the given document.
 *
 * Accessibility: the button sets `aria-busy` while generating and is disabled
 * during generation to prevent duplicate downloads. Pass `aria-label` for an
 * icon-only button.
 *
 * ```tsx
 * <PdfDownloadButton doc={doc} filename="invoice.pdf">Save invoice</PdfDownloadButton>
 * ```
 */
export function PdfDownloadButton({
  doc,
  filename,
  children,
  generatingLabel,
  onDownloaded,
  onError,
  disabled,
  ...rest
}: PdfDownloadButtonProps): React.ReactElement {
  const { download, generating, error } = usePdfDownload();
  const reportedError = React.useRef<Error | null>(null);

  React.useEffect(() => {
    if (error && error !== reportedError.current) {
      reportedError.current = error;
      onError?.(error);
    }
  }, [error, onError]);

  const handleClick = (): void => {
    download(doc, filename);
    if (!error) onDownloaded?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || generating}
      aria-busy={generating}
      {...rest}
    >
      {generating ? (generatingLabel ?? children ?? "Download PDF") : (children ?? "Download PDF")}
    </button>
  );
}
