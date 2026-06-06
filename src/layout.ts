/**
 * Pure layout math for the PDF writer.
 *
 * The PDF format positions every piece of text by absolute coordinates, so we
 * need to compute text widths, wrap long lines, and lay out tables ourselves.
 * Widths are estimated from the Helvetica Adobe Font Metrics (AFM) character
 * width table, which is accurate enough for wrapping decisions without pulling
 * in a font-parsing dependency.
 */

import type {
  FontStyle,
  Margins,
  Orientation,
  PageSize,
  PageDimensions,
  TableColumn,
  TextAlign,
} from "./types.js";

/** Page dimensions in points for the supported page sizes (portrait). */
export const PAGE_SIZES: Record<PageSize, PageDimensions> = {
  // 210mm x 297mm
  a4: { width: 595.28, height: 841.89 },
  // 297mm x 420mm
  a3: { width: 841.89, height: 1190.55 },
  // 148mm x 210mm
  a5: { width: 419.53, height: 595.28 },
  // 8.5in x 11in
  letter: { width: 612, height: 792 },
  // 8.5in x 14in
  legal: { width: 612, height: 1008 },
};

export const DEFAULT_MARGIN = 48;

/**
 * Resolve the page dimensions for a size + orientation. Landscape swaps the
 * width and height of the portrait base size.
 */
export function pageDimensions(
  size: PageSize = "a4",
  orientation: Orientation = "portrait",
): PageDimensions {
  const base = PAGE_SIZES[size];
  if (orientation === "landscape") {
    return { width: base.height, height: base.width };
  }
  return { width: base.width, height: base.height };
}

/** Resolve a possibly-partial margin spec into full margins. */
export function resolveMargins(m?: Partial<Margins>): Margins {
  return {
    top: m?.top ?? DEFAULT_MARGIN,
    right: m?.right ?? DEFAULT_MARGIN,
    bottom: m?.bottom ?? DEFAULT_MARGIN,
    left: m?.left ?? DEFAULT_MARGIN,
  };
}

/**
 * Per-1000-em advance widths for Helvetica, keyed by ASCII code point. This is
 * a compact subset of the Adobe AFM table covering the printable ASCII range.
 * Index 0 corresponds to code point 32 (space).
 */
// prettier-ignore
const HELVETICA_WIDTHS: number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** Helvetica-Bold advance widths (same ASCII subset, in 1000-em units). */
// prettier-ignore
const HELVETICA_BOLD_WIDTHS: number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

const FIRST_CODE = 32;
const DEFAULT_WIDTH = 556; // fallback advance for out-of-range glyphs

/** Map a {@link FontStyle} to the PDF resource font key (`/F1`.. `/F4`). */
export const FONT_KEYS: Record<FontStyle, string> = {
  normal: "/F1",
  bold: "/F2",
  italic: "/F3",
  "bold-italic": "/F4",
};

/** Normalize a (style | bold/italic) combination into a single FontStyle. */
export function resolveFontStyle(opts: {
  style?: FontStyle;
  bold?: boolean;
  italic?: boolean;
}): FontStyle {
  if (opts.style) return opts.style;
  const bold = opts.bold ?? false;
  const italic = opts.italic ?? false;
  if (bold && italic) return "bold-italic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "normal";
}

/** Whether a font style uses the bold metric table. */
export function isBoldStyle(style: FontStyle): boolean {
  return style === "bold" || style === "bold-italic";
}

/**
 * Measure the rendered width of `text` in points at a given font size.
 * Uses the Helvetica (or Helvetica-Bold) metric table. Italic glyphs share the
 * upright metrics (the oblique fonts are slanted, not re-spaced).
 */
export function measureText(text: string, fontSize: number, bold = false): number {
  const table = bold ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const idx = text.charCodeAt(i) - FIRST_CODE;
    const w = idx >= 0 && idx < table.length ? table[idx] : DEFAULT_WIDTH;
    units += w;
  }
  return (units / 1000) * fontSize;
}

/**
 * Wrap a single paragraph of text to fit within `maxWidth` points. Honours
 * existing newlines and breaks on spaces. Words longer than the line width are
 * hard-broken character by character so nothing overflows.
 */
export function wrapText(
  text: string,
  fontSize: number,
  maxWidth: number,
  bold = false,
): string[] {
  if (maxWidth <= 0) return text.split("\n");
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    const words = rawLine.split(" ");
    let line = "";
    for (const word of words) {
      // A single word wider than the line must be hard-broken.
      if (measureText(word, fontSize, bold) > maxWidth) {
        if (line) {
          out.push(line);
          line = "";
        }
        let chunk = "";
        for (const ch of word) {
          if (measureText(chunk + ch, fontSize, bold) > maxWidth && chunk) {
            out.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        line = chunk;
        continue;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (measureText(candidate, fontSize, bold) > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * Compute column widths for a table given the content area width.
 *
 * Columns with an explicit `width` are treated as flex weights: every column's
 * share is proportional to its weight, and columns without a weight default to
 * weight 1. This lets callers say `[{ width: 2 }, { width: 1 }]` for a 2:1
 * split, or omit widths entirely for equal columns.
 */
export function columnWidths(
  columnCount: number,
  contentWidth: number,
  columns?: TableColumn[],
): number[] {
  if (columnCount <= 0) return [];
  const weights = Array.from({ length: columnCount }, (_, i) => {
    const w = columns?.[i]?.width;
    return w != null && w > 0 ? w : 1;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / total) * contentWidth);
}

/**
 * Compute the x offset for a piece of `textWidth`-wide text aligned within a
 * region that starts at `regionX` and is `regionWidth` wide.
 */
export function alignOffset(
  align: TextAlign,
  textWidth: number,
  regionX: number,
  regionWidth: number,
): number {
  switch (align) {
    case "center":
      return regionX + (regionWidth - textWidth) / 2;
    case "right":
      return regionX + regionWidth - textWidth;
    case "left":
    default:
      return regionX;
  }
}

/** Recommended line height (leading) for a given font size. */
export function lineHeight(fontSize: number): number {
  return fontSize * 1.2;
}

/**
 * Read the pixel dimensions of a PNG or JPEG from its raw bytes. Returns
 * `null` for unrecognised data. Used to default image display sizes and to
 * preserve aspect ratio.
 */
export function imageSize(data: Uint8Array): { width: number; height: number } | null {
  // PNG: 8-byte signature, then IHDR with width/height as big-endian u32.
  if (
    data.length >= 24 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    const width = readU32BE(data, 16);
    const height = readU32BE(data, 20);
    return { width, height };
  }
  // JPEG: starts with FF D8; scan markers for a Start-Of-Frame segment.
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = data[offset + 1];
      // SOF0..SOF15 (excluding DHT C4, JPG C8, DAC CC) carry dimensions.
      const isSof =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;
      if (isSof) {
        const height = (data[offset + 5] << 8) | data[offset + 6];
        const width = (data[offset + 7] << 8) | data[offset + 8];
        return { width, height };
      }
      const segLen = (data[offset + 2] << 8) | data[offset + 3];
      if (segLen < 2) break;
      offset += 2 + segLen;
    }
  }
  return null;
}

function readU32BE(data: Uint8Array, at: number): number {
  return (
    (data[at] << 24) | (data[at + 1] << 16) | (data[at + 2] << 8) | data[at + 3]
  ) >>> 0;
}
