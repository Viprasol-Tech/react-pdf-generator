/**
 * react-pdf-generator — Generate downloadable PDFs from React component
 * definitions, with zero runtime dependencies.
 *
 * Maintained by Viprasol Tech (https://viprasol.com).
 */

export type {
  Block,
  HeadingBlock,
  Margins,
  PageDimensions,
  PageSize,
  PdfDoc,
  SpacerBlock,
  TableBlock,
  TextBlock,
} from "./types.js";

export {
  PAGE_SIZES,
  DEFAULT_MARGIN,
  columnWidths,
  lineHeight,
  measureText,
  resolveMargins,
  wrapText,
} from "./layout.js";

export { generatePdf, layoutDocument, pdfToBytes } from "./pdf.js";

export { usePdfDownload } from "./usePdfDownload.js";
export type { UsePdfDownloadResult } from "./usePdfDownload.js";

export { PdfDownloadButton } from "./PdfDownloadButton.js";
export type { PdfDownloadButtonProps } from "./PdfDownloadButton.js";
