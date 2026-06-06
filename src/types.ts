/**
 * Public data types for describing a PDF document.
 *
 * A document is plain, serializable data: an array of blocks rendered top to
 * bottom on one or more pages. This keeps the model framework-agnostic — the
 * React layer simply produces these structures.
 */

/** A single line/paragraph of text. */
export interface TextBlock {
  type: "text";
  /** The text content. Newlines are honoured and wrapped to the page width. */
  text: string;
  /** Font size in points. Defaults to 12. */
  fontSize?: number;
  /** Use the bold (Helvetica-Bold) font. Defaults to false. */
  bold?: boolean;
}

/** A heading — a larger, bold text block with extra spacing. */
export interface HeadingBlock {
  type: "heading";
  text: string;
  /** Heading level 1-3 controls the font size. Defaults to 1. */
  level?: 1 | 2 | 3;
}

/** A simple table: an optional header row plus body rows. */
export interface TableBlock {
  type: "table";
  /** Optional header cells rendered bold at the top of the table. */
  header?: string[];
  /** Body rows. Each row is an array of cell strings. */
  rows: string[][];
  /** Font size in points for cells. Defaults to 10. */
  fontSize?: number;
}

/** Vertical empty space, measured in points. */
export interface SpacerBlock {
  type: "spacer";
  height: number;
}

/** Any block that can appear in a document body. */
export type Block = TextBlock | HeadingBlock | TableBlock | SpacerBlock;

/** Standard page sizes in PostScript points (1pt = 1/72 inch). */
export type PageSize = "a4" | "letter";

/** Page margins in points. */
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A complete PDF document definition. */
export interface PdfDoc {
  /** Optional document title stored in the PDF Info dictionary. */
  title?: string;
  /** Page size. Defaults to "a4". */
  pageSize?: PageSize;
  /** Page margins in points. Defaults to 48 on every side. */
  margins?: Partial<Margins>;
  /** The document body, rendered in order. */
  blocks: Block[];
}

/** Pixel/point dimensions of a page. */
export interface PageDimensions {
  width: number;
  height: number;
}
