/**
 * A tiny, dependency-free PDF 1.4 writer.
 *
 * `generatePdf` turns a {@link PdfDoc} into a byte string that starts with the
 * `%PDF-1.4` header and contains a real object table, cross-reference (xref)
 * table, and trailer. The output opens in any standard PDF viewer.
 *
 * Text uses the four standard "base 14" Helvetica fonts (regular, bold,
 * oblique, bold-oblique), so no font embedding is required. Raster images
 * (PNG/JPEG) are embedded as XObjects.
 */

import type {
  Block,
  Color,
  FontStyle,
  ImageBlock,
  ListBlock,
  PageNumberConfig,
  PdfDoc,
  TableBlock,
  TextAlign,
} from "./types.js";
import { BLACK } from "./types.js";
import {
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

/** A single text-drawing instruction at an absolute page position. */
export interface TextOp {
  kind: "text";
  /** X position in points from the page's left edge. */
  x: number;
  /** Y position in points from the page's bottom edge (PDF origin). */
  y: number;
  text: string;
  fontSize: number;
  style: FontStyle;
  color: Color;
}

/** A filled rectangle (used for zebra shading). */
export interface RectOp {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  color: Color;
}

/** A straight line (used for table borders and dividers). */
export interface LineOp {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  color: Color;
}

/** Draw an embedded image XObject at an absolute position. */
export interface ImageOp {
  kind: "image";
  /** Resource id used to register and reference the XObject. */
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Any drawing instruction on a page. */
export type DrawOp = TextOp | RectOp | LineOp | ImageOp;

/** Escape a string for inclusion in a PDF literal `( ... )` string. */
function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Format a 0-255 RGB color as a PDF `r g b` triple in 0..1 space. */
function colorTriple(c: Color): string {
  const f = (n: number): string => (Math.max(0, Math.min(255, n)) / 255).toFixed(4);
  return `${f(c.r)} ${f(c.g)} ${f(c.b)}`;
}

const HEADING_SIZES: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 24,
  2: 20,
  3: 16,
  4: 14,
  5: 12,
  6: 11,
};

const GRAY: Color = { r: 128, g: 128, b: 128 };
const LIGHT_GRAY: Color = { r: 235, g: 235, b: 235 };
const BORDER_GRAY: Color = { r: 200, g: 200, b: 200 };

/** A decoded image ready to embed, keyed by resource id. */
export interface ImageResource {
  id: string;
  format: "png" | "jpeg";
  data: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  /** PNG color type (2 = RGB, 6 = RGBA), populated for PNGs. */
  pngColorType?: number;
  /** PNG bit depth, populated for PNGs. */
  pngBitDepth?: number;
}

/** Detect a supported image format from its byte signature. */
export function detectImageFormat(data: Uint8Array): "png" | "jpeg" | null {
  if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50) return "png";
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xd8) return "jpeg";
  return null;
}

/** PNG IHDR fields needed to embed the image faithfully. */
export interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
}

/** Read the IHDR chunk from a PNG. Returns null if not a PNG. */
export function readPngHeader(data: Uint8Array): PngHeader | null {
  if (!(data.length >= 26 && data[0] === 0x89 && data[1] === 0x50)) return null;
  // IHDR starts at byte 16 (after 8-byte signature + 4 length + 4 "IHDR").
  const width = ((data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19]) >>> 0;
  const height = ((data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23]) >>> 0;
  return {
    width,
    height,
    bitDepth: data[24],
    colorType: data[25],
    interlace: data[28],
  };
}

/** Concatenate all IDAT chunk payloads from a PNG into one zlib stream. */
export function extractPngIdat(data: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let offset = 8; // skip signature
  while (offset + 8 <= data.length) {
    const len =
      ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
    const type = String.fromCharCode(
      data[offset + 4],
      data[offset + 5],
      data[offset + 6],
      data[offset + 7],
    );
    const dataStart = offset + 8;
    if (type === "IDAT") parts.push(data.slice(dataStart, dataStart + len));
    if (type === "IEND") break;
    offset = dataStart + len + 4; // skip payload + CRC
  }
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The fully laid-out document: per-page draw ops plus collected resources. */
export interface LaidOutDocument {
  pages: DrawOp[][];
  width: number;
  height: number;
  images: ImageResource[];
}

/**
 * Lay out the document blocks into per-page draw operations. Exposed for
 * testing the pagination and positioning math directly.
 */
export function layoutDocument(doc: PdfDoc): LaidOutDocument {
  const { width, height } = pageDimensions(doc.pageSize, doc.orientation);
  const margins = resolveMargins(doc.margins);
  const contentWidth = width - margins.left - margins.right;
  const topY = height - margins.top;
  const footerReserve = doc.pageNumbers ? 18 : 0;
  const bottomLimit = margins.bottom + footerReserve;

  const images: ImageResource[] = [];
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
    style: FontStyle,
    color: Color,
    align: TextAlign,
    lh: number,
    x = margins.left,
    regionWidth = contentWidth,
  ): void => {
    const bold = isBoldStyle(style);
    for (const line of lines) {
      ensure(lh);
      cursorY -= lh;
      const textWidth = measureText(line, fontSize, bold);
      const tx = alignOffset(align, textWidth, x, regionWidth);
      current.push({ kind: "text", x: tx, y: cursorY, text: line, fontSize, style, color });
    }
  };

  const drawTable = (block: TableBlock): void => {
    const fontSize = block.fontSize ?? 10;
    const bodyRows = block.rows;
    const header = block.header;
    const colCount = [header ?? [], ...bodyRows].reduce(
      (max, r) => Math.max(max, r.length),
      0,
    );
    if (colCount === 0) return;
    const widths = columnWidths(colCount, contentWidth, block.columns);
    const lh = lineHeight(fontSize);
    const cellPad = 4;
    const borders = block.borders ?? true;
    const borderColor = block.borderColor ?? BORDER_GRAY;
    const repeatHeader = block.repeatHeader ?? true;
    const zebra = block.zebra ?? false;

    const colX = (c: number): number =>
      margins.left + widths.slice(0, c).reduce((a, b) => a + b, 0);

    /** Measure how tall a row would be once wrapped. */
    const rowHeightOf = (cells: string[], isHeader: boolean): number => {
      const bold = isHeader;
      const wrapped = Array.from({ length: colCount }, (_, c) =>
        wrapText(cells[c] ?? "", fontSize, widths[c] - cellPad * 2, bold),
      );
      const rowLines = wrapped.reduce((max, w) => Math.max(max, w.length), 1);
      return rowLines * lh;
    };

    const drawRow = (cells: string[], isHeader: boolean, bodyIndex: number): void => {
      const style: FontStyle = isHeader ? "bold" : "normal";
      const bold = isBoldStyle(style);
      const wrapped = Array.from({ length: colCount }, (_, c) =>
        wrapText(cells[c] ?? "", fontSize, widths[c] - cellPad * 2, bold),
      );
      const rowLines = wrapped.reduce((max, w) => Math.max(max, w.length), 1);
      const rowHeight = rowLines * lh;
      ensure(rowHeight);

      const rowTop = cursorY;
      const rowBottom = rowTop - rowHeight;

      if (zebra && !isHeader && bodyIndex % 2 === 1) {
        current.push({
          kind: "rect",
          x: margins.left,
          y: rowBottom,
          width: contentWidth,
          height: rowHeight,
          color: LIGHT_GRAY,
        });
      }

      wrapped.forEach((cellLines, c) => {
        const align = block.columns?.[c]?.align ?? "left";
        const innerX = colX(c) + cellPad;
        const innerWidth = widths[c] - cellPad * 2;
        cellLines.forEach((line, li) => {
          const textWidth = measureText(line, fontSize, bold);
          const tx = alignOffset(align, textWidth, innerX, innerWidth);
          current.push({
            kind: "text",
            x: tx,
            y: rowTop - (li + 1) * lh + (lh - fontSize) / 2,
            text: line,
            fontSize,
            style,
            color: BLACK,
          });
        });
      });

      if (borders) {
        // Horizontal top and bottom lines.
        current.push({
          kind: "line",
          x1: margins.left,
          y1: rowTop,
          x2: margins.left + contentWidth,
          y2: rowTop,
          width: 0.5,
          color: borderColor,
        });
        current.push({
          kind: "line",
          x1: margins.left,
          y1: rowBottom,
          x2: margins.left + contentWidth,
          y2: rowBottom,
          width: 0.5,
          color: borderColor,
        });
        // Vertical separators.
        for (let c = 0; c <= colCount; c++) {
          const vx = colX(c);
          current.push({
            kind: "line",
            x1: vx,
            y1: rowTop,
            x2: vx,
            y2: rowBottom,
            width: 0.5,
            color: borderColor,
          });
        }
      }

      cursorY = rowBottom;
    };

    if (header) drawRow(header, true, -1);
    bodyRows.forEach((row, i) => {
      // If this row would overflow onto a new page, start the page first and
      // re-print the header at the top so the table stays readable.
      if (header && repeatHeader) {
        const h = rowHeightOf(row, false);
        if (cursorY - h < bottomLimit && current.length > 0) {
          newPage();
          drawRow(header, true, -1);
        }
      }
      drawRow(row, false, i);
    });
  };

  const drawList = (block: ListBlock): void => {
    const fontSize = block.fontSize ?? 12;
    const indent = block.indent ?? 18;
    const color = block.color ?? BLACK;
    const lh = lineHeight(fontSize);
    const textWidth = contentWidth - indent;
    block.items.forEach((item, i) => {
      const marker = block.ordered ? `${i + 1}.` : "•";
      const lines = wrapText(item, fontSize, textWidth, false);
      lines.forEach((line, li) => {
        ensure(lh);
        cursorY -= lh;
        if (li === 0) {
          current.push({
            kind: "text",
            x: margins.left,
            y: cursorY,
            text: marker,
            fontSize,
            style: "normal",
            color,
          });
        }
        current.push({
          kind: "text",
          x: margins.left + indent,
          y: cursorY,
          text: line,
          fontSize,
          style: "normal",
          color,
        });
      });
    });
  };

  const drawImage = (block: ImageBlock): void => {
    const format = detectImageFormat(block.data);
    if (!format) return;
    const natural = imageSize(block.data);
    let w = block.width;
    let h = block.height;
    if (w == null && h == null) {
      w = natural?.width ?? contentWidth;
      h = natural?.height ?? w;
    } else if (w == null) {
      const ratio = natural ? natural.width / natural.height : 1;
      w = (h as number) * ratio;
    } else if (h == null) {
      const ratio = natural ? natural.height / natural.width : 1;
      h = w * ratio;
    }
    // Clamp to the content width, preserving aspect ratio.
    if (w! > contentWidth) {
      const scale = contentWidth / w!;
      w = contentWidth;
      h = h! * scale;
    }
    const id = `Im${images.length + 1}`;
    const png = format === "png" ? readPngHeader(block.data) : null;
    images.push({
      id,
      format,
      data: format === "png" ? extractPngIdat(block.data) : block.data,
      pixelWidth: natural?.width ?? Math.round(w!),
      pixelHeight: natural?.height ?? Math.round(h!),
      pngColorType: png?.colorType,
      pngBitDepth: png?.bitDepth,
    });
    ensure(h!);
    cursorY -= h!;
    const align = block.align ?? "left";
    const x = alignOffset(align, w!, margins.left, contentWidth);
    current.push({ kind: "image", id, x, y: cursorY, width: w!, height: h! });
  };

  const drawDivider = (block: { thickness?: number; color?: Color; spacing?: number }): void => {
    const thickness = block.thickness ?? 1;
    const color = block.color ?? GRAY;
    const spacing = block.spacing ?? 6;
    ensure(spacing * 2 + thickness);
    cursorY -= spacing;
    cursorY -= thickness;
    current.push({
      kind: "line",
      x1: margins.left,
      y1: cursorY + thickness / 2,
      x2: margins.left + contentWidth,
      y2: cursorY + thickness / 2,
      width: thickness,
      color,
    });
    cursorY -= spacing;
  };

  const drawBlock = (block: Block): void => {
    switch (block.type) {
      case "text": {
        const fontSize = block.fontSize ?? 12;
        const style = resolveFontStyle(block);
        const bold = isBoldStyle(style);
        const lines = wrapText(block.text, fontSize, contentWidth, bold);
        const lh = block.lineHeight ?? lineHeight(fontSize);
        drawLines(lines, fontSize, style, block.color ?? BLACK, block.align ?? "left", lh);
        break;
      }
      case "heading": {
        const fontSize = HEADING_SIZES[block.level ?? 1];
        const lines = wrapText(block.text, fontSize, contentWidth, true);
        cursorY -= fontSize * 0.4; // small space above heading
        drawLines(
          lines,
          fontSize,
          "bold",
          block.color ?? BLACK,
          block.align ?? "left",
          lineHeight(fontSize),
        );
        cursorY -= fontSize * 0.3; // small space below heading
        break;
      }
      case "table":
        drawTable(block);
        break;
      case "list":
        drawList(block);
        break;
      case "image":
        drawImage(block);
        break;
      case "divider":
        drawDivider(block);
        break;
      case "pageBreak":
        if (current.length > 0) newPage();
        break;
      case "spacer":
        cursorY -= block.height;
        break;
    }
  };

  for (const block of doc.blocks) drawBlock(block);
  pages.push(current);

  if (doc.pageNumbers) {
    appendPageNumbers(pages, doc, margins.bottom, contentWidth, margins.left);
  }

  return { pages, width, height, images };
}

/** Append a page-number footer text op to every page. */
function appendPageNumbers(
  pages: DrawOp[][],
  doc: PdfDoc,
  marginBottom: number,
  contentWidth: number,
  marginLeft: number,
): void {
  const cfg: PageNumberConfig = typeof doc.pageNumbers === "object" ? doc.pageNumbers : {};
  const template = cfg.template ?? "{page} / {total}";
  const align = cfg.align ?? "center";
  const fontSize = cfg.fontSize ?? 9;
  const color = cfg.color ?? GRAY;
  const total = pages.length;
  // Baseline sits inside the bottom margin band, just above the page edge.
  const baselineY = Math.max(4, marginBottom - fontSize - 2);
  pages.forEach((ops, i) => {
    const text = template.replace("{page}", String(i + 1)).replace("{total}", String(total));
    const textWidth = measureText(text, fontSize, false);
    const x = alignOffset(align, textWidth, marginLeft, contentWidth);
    ops.push({ kind: "text", x, y: baselineY, text, fontSize, style: "normal", color });
  });
}

/** Build the content-stream drawing program for one page. */
export function buildContentStream(ops: DrawOp[]): string {
  const parts: string[] = [];
  for (const op of ops) {
    switch (op.kind) {
      case "text": {
        if (op.text.length === 0) continue;
        const font = FONT_KEYS[op.style];
        parts.push("BT");
        parts.push(`${colorTriple(op.color)} rg`);
        parts.push(`${font} ${op.fontSize} Tf`);
        parts.push(`1 0 0 1 ${op.x.toFixed(2)} ${op.y.toFixed(2)} Tm`);
        parts.push(`(${escapePdfText(op.text)}) Tj`);
        parts.push("ET");
        break;
      }
      case "rect": {
        parts.push(`${colorTriple(op.color)} rg`);
        parts.push(
          `${op.x.toFixed(2)} ${op.y.toFixed(2)} ${op.width.toFixed(2)} ${op.height.toFixed(2)} re f`,
        );
        break;
      }
      case "line": {
        parts.push(`${colorTriple(op.color)} RG`);
        parts.push(`${op.width.toFixed(2)} w`);
        parts.push(`${op.x1.toFixed(2)} ${op.y1.toFixed(2)} m ${op.x2.toFixed(2)} ${op.y2.toFixed(2)} l S`);
        break;
      }
      case "image": {
        parts.push("q");
        parts.push(
          `${op.width.toFixed(2)} 0 0 ${op.height.toFixed(2)} ${op.x.toFixed(2)} ${op.y.toFixed(2)} cm`,
        );
        parts.push(`/${op.id} Do`);
        parts.push("Q");
        break;
      }
    }
  }
  return parts.join("\n");
}

/** Build the dictionary + stream for an embedded image XObject. */
function buildImageObject(img: ImageResource): { dict: string; binary: Uint8Array } {
  const len = img.data.length;
  if (img.format === "jpeg") {
    const dict =
      `<< /Type /XObject /Subtype /Image /Width ${img.pixelWidth} ` +
      `/Height ${img.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
      `/Filter /DCTDecode /Length ${len} >>`;
    return { dict, binary: img.data };
  }
  // PNG: the concatenated IDAT chunks are already a zlib (FlateDecode) stream
  // of the scanlines, each prefixed with a PNG filter-type byte. PDF can decode
  // this directly via /FlateDecode plus a PNG predictor in /DecodeParms.
  //
  // Supported, faithfully: 8-bit non-interlaced grayscale (colorType 0) and
  // truecolor RGB (colorType 2). These are what design tools emit for opaque
  // images. (RGBA/palette PNGs would need a full decode to split alpha, which
  // is out of scope for a zero-dependency writer — convert to JPEG or flat RGB
  // PNG first.)
  const colorType = img.pngColorType ?? 2;
  const bits = img.pngBitDepth ?? 8;
  const colors = colorType === 0 ? 1 : 3;
  const colorSpace = colors === 1 ? "/DeviceGray" : "/DeviceRGB";
  // Predictor 15 = "PNG optimum"; Colors/BPC/Columns describe the scanlines.
  const decodeParms =
    `<< /Predictor 15 /Colors ${colors} /BitsPerComponent ${bits} ` +
    `/Columns ${img.pixelWidth} >>`;
  const dict =
    `<< /Type /XObject /Subtype /Image /Width ${img.pixelWidth} ` +
    `/Height ${img.pixelHeight} /ColorSpace ${colorSpace} /BitsPerComponent ${bits} ` +
    `/Filter /FlateDecode /DecodeParms ${decodeParms} /Length ${len} >>`;
  return { dict, binary: img.data };
}

/**
 * Generate a complete PDF document as a string of bytes (Latin-1 / binary
 * safe). The returned string begins with `%PDF-1.4` and ends with `%%EOF`.
 *
 * Note: for binary-safe image embedding, prefer {@link generatePdfBytes}.
 */
export function generatePdf(doc: PdfDoc): string {
  return bytesToLatin1(generatePdfBytes(doc));
}

/**
 * Generate a complete PDF as raw bytes. This is the binary-safe entry point
 * and is required when the document embeds images.
 */
export function generatePdfBytes(doc: PdfDoc): Uint8Array {
  const { pages, width, height, images } = layoutDocument(doc);

  // Object plan (1-indexed):
  //   1: Catalog
  //   2: Pages tree
  //   3-6: Fonts F1..F4
  //   then per page: Page object + Contents stream object
  //   then per image: XObject
  //   then: Info dictionary (last)
  const FIRST_PAGE_OBJ = 7;
  const pageObjNums: number[] = [];
  pages.forEach((_, i) => pageObjNums.push(FIRST_PAGE_OBJ + i * 2));
  const firstImageObj = FIRST_PAGE_OBJ + pages.length * 2;
  const imageObjNums = images.map((_, i) => firstImageObj + i);
  const infoObj = firstImageObj + images.length;

  // Build a shared XObject resource entry for all pages.
  const xobjectEntries = images
    .map((img, i) => `/${img.id} ${imageObjNums[i]} 0 R`)
    .join(" ");
  const xobjectResource = images.length > 0 ? ` /XObject << ${xobjectEntries} >>` : "";

  const kids = pageObjNums.map((n) => `${n} 0 R`).join(" ");

  // Serialize. We assemble byte chunks so image streams stay binary-clean.
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (s: string | Uint8Array): void => {
    const bytes = typeof s === "string" ? latin1ToBytes(s) : s;
    chunks.push(bytes);
    pos += bytes.length;
  };
  const obj = (num: number, body: string): void => {
    offsets[num] = pos;
    push(`${num} 0 obj\n${body}\nendobj\n`);
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  obj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`);
  obj(3, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  obj(4, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);
  obj(5, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>`);
  obj(6, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique >>`);

  pages.forEach((ops, i) => {
    const pageObj = FIRST_PAGE_OBJ + i * 2;
    const contentObj = pageObj + 1;
    const stream = buildContentStream(ops);
    const streamBytes = latin1ToBytes(stream);
    obj(
      pageObj,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width.toFixed(2)} ${height.toFixed(2)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >>${xobjectResource} >> ` +
        `/Contents ${contentObj} 0 R >>`,
    );
    // Content stream object (with binary-safe length).
    offsets[contentObj] = pos;
    push(`${contentObj} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`);
    push(streamBytes);
    push(`\nendstream\nendobj\n`);
  });

  images.forEach((img, i) => {
    const num = imageObjNums[i];
    const { dict, binary } = buildImageObject(img);
    offsets[num] = pos;
    push(`${num} 0 obj\n${dict}\nstream\n`);
    push(binary);
    push(`\nendstream\nendobj\n`);
  });

  const infoParts = [`/Producer (react-pdf-generator)`];
  if (doc.title) infoParts.unshift(`/Title (${escapePdfText(doc.title)})`);
  if (doc.author) infoParts.push(`/Author (${escapePdfText(doc.author)})`);
  if (doc.subject) infoParts.push(`/Subject (${escapePdfText(doc.subject)})`);
  obj(infoObj, `<< ${infoParts.join(" ")} >>`);

  // Cross-reference table.
  const xrefStart = pos;
  const totalObjects = infoObj;
  let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= totalObjects; i++) {
    xref += `${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);

  push(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R /Info ${infoObj} 0 R >>\n` +
      `startxref\n${xrefStart}\n%%EOF\n`,
  );

  return concatBytes(chunks);
}

/**
 * Convert a Latin-1 / binary string into a `Uint8Array` of bytes. Each
 * character maps directly to one byte.
 */
export function pdfToBytes(pdf: string): Uint8Array {
  return latin1ToBytes(pdf);
}

function latin1ToBytes(s: string): Uint8Array {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  return bytes;
}

function bytesToLatin1(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
