/**
 * A ready-to-use button that downloads a {@link PdfDoc} when clicked.
 */

import * as React from "react";
import type { PdfDoc } from "./types.js";
import { usePdfDownload } from "./usePdfDownload.js";

export interface PdfDownloadButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** The document to generate when the button is clicked. */
  doc: PdfDoc;
  /** Download filename. Defaults to "document.pdf". */
  filename?: string;
  /** Button label. Defaults to "Download PDF". */
  children?: React.ReactNode;
  /** Called after a successful download is triggered. */
  onDownloaded?: () => void;
}

/**
 * Renders a `<button>` that generates and downloads the given document.
 *
 * ```tsx
 * <PdfDownloadButton doc={doc} filename="invoice.pdf">Save invoice</PdfDownloadButton>
 * ```
 */
export function PdfDownloadButton({
  doc,
  filename,
  children,
  onDownloaded,
  disabled,
  ...rest
}: PdfDownloadButtonProps): React.ReactElement {
  const { download, generating } = usePdfDownload();

  const handleClick = (): void => {
    download(doc, filename);
    onDownloaded?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || generating}
      aria-busy={generating}
      {...rest}
    >
      {children ?? "Download PDF"}
    </button>
  );
}
