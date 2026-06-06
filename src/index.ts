/**
 * react-pdf-generator — Generate downloadable PDFs from React component
 * definitions, with zero runtime dependencies.
 *
 * Maintained by Viprasol Tech (https://viprasol.com).
 */

export type {
  Block,
  Color,
  DividerBlock,
  FontStyle,
  HeadingBlock,
  ImageBlock,
  ListBlock,
  Margins,
  Orientation,
  PageBreakBlock,
  PageDimensions,
  PageNumberConfig,
  PageSize,
  PdfDoc,
  SpacerBlock,
  TableBlock,
  TableColumn,
  TextAlign,
  TextBlock,
} from "./types.js";

export { BLACK } from "./types.js";

export {
  PAGE_SIZES,
  DEFAULT_MARGIN,
  FONT_KEYS,
  alignOffset,
  columnWidths,
  imageSize,
  isBoldStyle,
  lineHeight,
  measureText,
  pageDimensions,
  resolveFontStyle,
  resolveMargins,
  wrapText,
} from "./layout.js";

export {
  buildContentStream,
  detectImageFormat,
  extractPngIdat,
  generatePdf,
  generatePdfBytes,
  layoutDocument,
  pdfToBytes,
  readPngHeader,
} from "./pdf.js";
export type {
  DrawOp,
  ImageOp,
  ImageResource,
  LaidOutDocument,
  LineOp,
  PngHeader,
  RectOp,
  TextOp,
} from "./pdf.js";

export { usePdfDownload } from "./usePdfDownload.js";
export type { UsePdfDownloadResult } from "./usePdfDownload.js";

export { PdfDownloadButton } from "./PdfDownloadButton.js";
export type { PdfDownloadButtonProps } from "./PdfDownloadButton.js";
