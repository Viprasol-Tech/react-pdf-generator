/**
 * A tiny, dependency-free PDF 1.4 writer.
 *
 * `generatePdf` turns a {@link PdfDoc} into a byte string that starts with the
 * `%PDF-1.4` header and contains a real object table, cross-reference (xref)
 * table, and trailer. The output opens in any standard PDF viewer.
 *
 * The writer only uses the two standard "base 14" fonts (Helvetica and
 * Helvetica-Bold), so no font embedding is required.
 */

import type { Block, PdfDoc, TableBlock } from "./types.js";
import {
  PAGE_SIZES,
  columnWidths,
  lineHeight,
  resolveMargins,
  wrapText,
} from "./layout.js";

/** A single text-drawing instruction at an absolute page position. */
interface DrawOp {
  /** X position in points from the page's left edge. */
  x: number;
  /** Y position in points from the page's bottom edge (PDF origin). */
  y: number;
  text: string;
  fontSize: number;
  bold: boolean;
}

/** Escape a string for inclusion in a PDF literal `( ... )` string. */
function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const HEADING_SIZES: Record<1 | 2 | 3, number> = { 1: 22, 2: 16, 3: 13 };

/**
 * Lay out the document blocks into per-page draw operations. Exposed for
 * testing the pagination math directly.
 */
export function layoutDocument(doc: PdfDoc): { pages: DrawOp[][]; width: number; height: number } {
  const size = PAGE_SIZES[doc.pageSize ?? "a4"];
  const margins = resolveMargins(doc.margins);
  const contentWidth = size.width - margins.left - margins.right;
  const topY = size.height - margins.top;
  const bottomLimit = margins.bottom;

  const pages: DrawOp[][] = [];
  let current: DrawOp[] = [];
  let cursorY = topY;

  const newPage = (): void => {
    pages.push(current);
    current = [];
    cursorY = topY;
  };

  /** Reserve vertical space, starting a new page if it would overflow. */
  const ensure = (needed: number): void => {
    if (cursorY - needed < bottomLimit && current.length > 0) {
      newPage();
    }
  };

  const drawLines = (
    lines: string[],
    fontSize: number,
    bold: boolean,
    x = margins.left,
  ): void => {
    const lh = lineHeight(fontSize);
    for (const line of lines) {
      ensure(lh);
      cursorY -= lh;
      current.push({ x, y: cursorY, text: line, fontSize, bold });
    }
  };

  const drawTable = (block: TableBlock): void => {
    const fontSize = block.fontSize ?? 10;
    const rows = block.header ? [block.header, ...block.rows] : block.rows;
    const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
    if (colCount === 0) return;
    const widths = columnWidths(colCount, contentWidth);
    const lh = lineHeight(fontSize);
    const cellPad = 4;

    rows.forEach((row, rowIdx) => {
      const isHeader = block.header != null && rowIdx === 0;
      // Wrap each cell, then the row height is the tallest cell.
      const wrapped = Array.from({ length: colCount }, (_, c) =>
        wrapText(row[c] ?? "", fontSize, widths[c] - cellPad * 2, isHeader),
      );
      const rowLines = wrapped.reduce((max, w) => Math.max(max, w.length), 1);
      const rowHeight = rowLines * lh;
      ensure(rowHeight);

      const rowTop = cursorY;
      wrapped.forEach((cellLines, c) => {
        const colX = margins.left + widths.slice(0, c).reduce((a, b) => a + b, 0) + cellPad;
        cellLines.forEach((line, li) => {
          current.push({
            x: colX,
            y: rowTop - (li + 1) * lh + (lh - fontSize) / 2,
            text: line,
            fontSize,
            bold: isHeader,
          });
        });
      });
      cursorY -= rowHeight;
    });
  };

  const drawBlock = (block: Block): void => {
    switch (block.type) {
      case "text": {
        const fontSize = block.fontSize ?? 12;
        const lines = wrapText(block.text, fontSize, contentWidth, block.bold ?? false);
        drawLines(lines, fontSize, block.bold ?? false);
        break;
      }
      case "heading": {
        const fontSize = HEADING_SIZES[block.level ?? 1];
        const lines = wrapText(block.text, fontSize, contentWidth, true);
        cursorY -= fontSize * 0.4; // small space above heading
        drawLines(lines, fontSize, true);
        cursorY -= fontSize * 0.3; // small space below heading
        break;
      }
      case "table":
        drawTable(block);
        break;
      case "spacer":
        cursorY -= block.height;
        break;
    }
  };

  for (const block of doc.blocks) drawBlock(block);
  pages.push(current);

  return { pages, width: size.width, height: size.height };
}

/** Build the content-stream text-drawing program for one page. */
function buildContentStream(ops: DrawOp[]): string {
  const parts: string[] = [];
  for (const op of ops) {
    if (op.text.length === 0) continue;
    const font = op.bold ? "/F2" : "/F1";
    parts.push("BT");
    parts.push(`${font} ${op.fontSize} Tf`);
    parts.push(`1 0 0 1 ${op.x.toFixed(2)} ${op.y.toFixed(2)} Tm`);
    parts.push(`(${escapePdfText(op.text)}) Tj`);
    parts.push("ET");
  }
  return parts.join("\n");
}

/**
 * Generate a complete PDF document as a string of bytes (Latin-1 / binary
 * safe). The returned string begins with `%PDF-1.4` and ends with `%%EOF`.
 */
export function generatePdf(doc: PdfDoc): string {
  const { pages, width, height } = layoutDocument(doc);

  // Object plan (1-indexed):
  //   1: Catalog
  //   2: Pages tree
  //   3: Font Helvetica (F1)
  //   4: Font Helvetica-Bold (F2)
  //   then per page: a Page object and its Contents stream object.
  const objects: string[] = [];
  const pageObjNums: number[] = [];

  const FIRST_PAGE_OBJ = 5;
  pages.forEach((_, i) => {
    pageObjNums.push(FIRST_PAGE_OBJ + i * 2);
  });

  const kids = pageObjNums.map((n) => `${n} 0 R`).join(" ");
  const title = doc.title ?? "";

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;

  pages.forEach((ops, i) => {
    const pageObj = FIRST_PAGE_OBJ + i * 2;
    const contentObj = pageObj + 1;
    const stream = buildContentStream(ops);
    objects[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width.toFixed(2)} ${height.toFixed(2)}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`;
    objects[contentObj] =
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  // The Info dictionary is the highest object number.
  const infoObj = FIRST_PAGE_OBJ + pages.length * 2;
  objects[infoObj] = `<< /Title (${escapePdfText(title)}) /Producer (react-pdf-generator) >>`;

  // Serialize objects and record byte offsets for the xref table.
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  const totalObjects = infoObj;
  for (let i = 1; i <= totalObjects; i++) {
    offsets[i] = body.length;
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  // Cross-reference table.
  const xrefStart = body.length;
  let xref = `xref\n0 ${totalObjects + 1}\n`;
  xref += `0000000000 65535 f \n`;
  for (let i = 1; i <= totalObjects; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  const trailer =
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R /Info ${infoObj} 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;

  return body + xref + trailer;
}

/**
 * Convert the PDF string into a `Uint8Array` of bytes. Each character maps
 * directly to one byte (the writer only emits Latin-1 code points).
 */
export function pdfToBytes(pdf: string): Uint8Array {
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
