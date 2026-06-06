/**
 * Pure layout math for the PDF writer.
 *
 * The PDF format positions every piece of text by absolute coordinates, so we
 * need to compute text widths, wrap long lines, and lay out tables ourselves.
 * Widths are estimated from the Helvetica Adobe Font Metrics (AFM) character
 * width table, which is accurate enough for wrapping decisions without pulling
 * in a font-parsing dependency.
 */

import type { Margins, PageSize, PageDimensions } from "./types.js";

/** Page dimensions in points for the supported page sizes. */
export const PAGE_SIZES: Record<PageSize, PageDimensions> = {
  // 210mm x 297mm
  a4: { width: 595.28, height: 841.89 },
  // 8.5in x 11in
  letter: { width: 612, height: 792 },
};

export const DEFAULT_MARGIN = 48;

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

/**
 * Measure the rendered width of `text` in points at a given font size.
 * Uses the Helvetica (or Helvetica-Bold) metric table.
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
 * Compute even column widths for a table given the content area width.
 * Each column gets an equal share of the available width.
 */
export function columnWidths(columnCount: number, contentWidth: number): number[] {
  if (columnCount <= 0) return [];
  const w = contentWidth / columnCount;
  return Array.from({ length: columnCount }, () => w);
}

/** Recommended line height (leading) for a given font size. */
export function lineHeight(fontSize: number): number {
  return fontSize * 1.2;
}
