/**
 * Public data types for describing a PDF document.
 *
 * A document is plain, serializable data: an array of blocks rendered top to
 * bottom on one or more pages. This keeps the model framework-agnostic — the
 * React layer simply produces these structures.
 */

/** Horizontal text alignment within the content area. */
export type TextAlign = "left" | "center" | "right";

/** Font style applied to a run of text. */
export type FontStyle = "normal" | "bold" | "italic" | "bold-italic";

/**
 * An RGB color. Each channel is 0-255. Used for text fills, rules, and table
 * borders. Defaults to black ({@link BLACK}) where omitted.
 */
export interface Color {
  r: number;
  g: number;
  b: number;
}

/** A single line/paragraph of text. */
export interface TextBlock {
  type: "text";
  /** The text content. Newlines are honoured and wrapped to the page width. */
  text: string;
  /** Font size in points. Defaults to 12. */
  fontSize?: number;
  /** Use the bold font. Shorthand for `style: "bold"`. Defaults to false. */
  bold?: boolean;
  /** Use the italic (oblique) font. Defaults to false. */
  italic?: boolean;
  /**
   * Full font style. When set it takes precedence over `bold`/`italic`.
   * Lets you express bold-italic in one field.
   */
  style?: FontStyle;
  /** Horizontal alignment. Defaults to "left". */
  align?: TextAlign;
  /** Text fill color. Defaults to black. */
  color?: Color;
  /** Override the line height (leading) in points. Defaults to 1.2x font size. */
  lineHeight?: number;
}

/** A heading — a larger, bold text block with extra spacing. */
export interface HeadingBlock {
  type: "heading";
  text: string;
  /** Heading level 1-6 controls the font size. Defaults to 1. */
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Horizontal alignment. Defaults to "left". */
  align?: TextAlign;
  /** Heading color. Defaults to black. */
  color?: Color;
}

/** A column definition for a {@link TableBlock}. */
export interface TableColumn {
  /**
   * Relative or absolute width. Columns without a width share the remaining
   * space equally. Values are treated as flex weights relative to each other
   * and to the remaining space after fixed columns.
   */
  width?: number;
  /** Cell text alignment for this column. Defaults to "left". */
  align?: TextAlign;
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
  /**
   * Per-column configuration (widths/alignment). When omitted columns are
   * sized equally. May be shorter than the column count; missing entries fall
   * back to defaults.
   */
  columns?: TableColumn[];
  /** Draw cell border lines. Defaults to true. */
  borders?: boolean;
  /** Border/line color. Defaults to a medium gray. */
  borderColor?: Color;
  /** Repeat the header row at the top of every page the table spans. Defaults to true. */
  repeatHeader?: boolean;
  /** Shade alternating body rows for readability. Defaults to false. */
  zebra?: boolean;
}

/** An ordered or unordered list. */
export interface ListBlock {
  type: "list";
  /** The list items. Each item is wrapped independently. */
  items: string[];
  /** "bullet" (default) or "number". */
  ordered?: boolean;
  /** Font size in points. Defaults to 12. */
  fontSize?: number;
  /** Marker/indent width in points. Defaults to 18. */
  indent?: number;
  /** Item color. Defaults to black. */
  color?: Color;
}

/** A raster image embedded in the document. */
export interface ImageBlock {
  type: "image";
  /**
   * Raw image bytes. PNG and JPEG are supported; the format is auto-detected
   * from the byte signature.
   */
  data: Uint8Array;
  /** Display width in points. Defaults to the natural pixel width. */
  width?: number;
  /** Display height in points. Defaults to a value preserving aspect ratio. */
  height?: number;
  /** Horizontal alignment. Defaults to "left". */
  align?: TextAlign;
}

/** A horizontal rule (divider line). */
export interface DividerBlock {
  type: "divider";
  /** Line thickness in points. Defaults to 1. */
  thickness?: number;
  /** Line color. Defaults to a medium gray. */
  color?: Color;
  /** Vertical padding above and below the line in points. Defaults to 6. */
  spacing?: number;
}

/** A forced page break. Subsequent blocks start on a fresh page. */
export interface PageBreakBlock {
  type: "pageBreak";
}

/** Vertical empty space, measured in points. */
export interface SpacerBlock {
  type: "spacer";
  height: number;
}

/** Any block that can appear in a document body. */
export type Block =
  | TextBlock
  | HeadingBlock
  | TableBlock
  | ListBlock
  | ImageBlock
  | DividerBlock
  | PageBreakBlock
  | SpacerBlock;

/** Standard page sizes in PostScript points (1pt = 1/72 inch). */
export type PageSize = "a4" | "letter" | "legal" | "a3" | "a5";

/** Page orientation. */
export type Orientation = "portrait" | "landscape";

/** Page margins in points. */
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Configuration for an automatic page-number footer. */
export interface PageNumberConfig {
  /**
   * Template for the rendered string. `{page}` and `{total}` are substituted.
   * Defaults to "{page} / {total}".
   */
  template?: string;
  /** Footer alignment. Defaults to "center". */
  align?: TextAlign;
  /** Font size in points. Defaults to 9. */
  fontSize?: number;
  /** Text color. Defaults to a medium gray. */
  color?: Color;
}

/** A complete PDF document definition. */
export interface PdfDoc {
  /** Optional document title stored in the PDF Info dictionary. */
  title?: string;
  /** Optional author stored in the PDF Info dictionary. */
  author?: string;
  /** Optional subject stored in the PDF Info dictionary. */
  subject?: string;
  /** Page size. Defaults to "a4". */
  pageSize?: PageSize;
  /** Page orientation. Defaults to "portrait". */
  orientation?: Orientation;
  /** Page margins in points. Defaults to 48 on every side. */
  margins?: Partial<Margins>;
  /**
   * Add an automatic page-number footer to every page. Pass `true` for the
   * defaults or an object to customise.
   */
  pageNumbers?: boolean | PageNumberConfig;
  /** The document body, rendered in order. */
  blocks: Block[];
}

/** Pixel/point dimensions of a page. */
export interface PageDimensions {
  width: number;
  height: number;
}

/** Solid black, the default fill color. */
export const BLACK: Color = { r: 0, g: 0, b: 0 };
