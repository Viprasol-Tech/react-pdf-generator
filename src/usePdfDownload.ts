/**
 * React hook that wires a {@link PdfDoc} to a browser download.
 */

import { useCallback, useState } from "react";
import type { PdfDoc } from "./types.js";
import { generatePdf, pdfToBytes } from "./pdf.js";

export interface UsePdfDownloadResult {
  /** Generate the PDF for `doc` and trigger a browser download. */
  download: (doc: PdfDoc, filename?: string) => void;
  /** Produce a `Blob` for the document without downloading it. */
  toBlob: (doc: PdfDoc) => Blob;
  /** True while a download is in progress. */
  generating: boolean;
  /** The last error thrown during generation, if any. */
  error: Error | null;
}

const DEFAULT_FILENAME = "document.pdf";

/**
 * Returns helpers to generate and download a PDF from a document definition.
 *
 * ```tsx
 * const { download } = usePdfDownload();
 * <button onClick={() => download(doc, "invoice.pdf")}>Download</button>
 * ```
 */
export function usePdfDownload(): UsePdfDownloadResult {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const toBlob = useCallback((doc: PdfDoc): Blob => {
    const bytes = pdfToBytes(generatePdf(doc));
    // Copy into a fresh ArrayBuffer so the Blob owns its bytes.
    return new Blob([bytes.slice().buffer], { type: "application/pdf" });
  }, []);

  const download = useCallback(
    (doc: PdfDoc, filename = DEFAULT_FILENAME): void => {
      setGenerating(true);
      setError(null);
      try {
        const blob = toBlob(doc);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setGenerating(false);
      }
    },
    [toBlob],
  );

  return { download, toBlob, generating, error };
}
