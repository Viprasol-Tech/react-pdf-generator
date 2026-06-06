import { describe, it, expect } from "vitest";
import {
  PAGE_SIZES,
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
} from "../layout.js";

describe("measureText", () => {
  it("returns 0 for empty strings", () => {
    expect(measureText("", 12)).toBe(0);
  });

  it("scales linearly with font size", () => {
    const a = measureText("Hello", 10);
    const b = measureText("Hello", 20);
    expect(b).toBeCloseTo(a * 2, 5);
  });

  it("measures bold wider than regular for the same text", () => {
    // 'b' is 556 regular vs 611 bold per the AFM tables.
    expect(measureText("b", 12, true)).toBeGreaterThan(measureText("b", 12, false));
  });

  it("a space has a positive advance", () => {
    expect(measureText(" ", 12)).toBeGreaterThan(0);
  });
});

describe("wrapText", () => {
  it("keeps short text on one line", () => {
    const lines = wrapText("hello world", 12, 1000);
    expect(lines).toEqual(["hello world"]);
  });

  it("wraps long text onto multiple lines that each fit", () => {
    const text = "the quick brown fox jumps over the lazy dog again and again";
    const maxWidth = 120;
    const lines = wrapText(text, 12, maxWidth);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measureText(line, 12)).toBeLessThanOrEqual(maxWidth + 0.001);
    }
    // No words are lost.
    expect(lines.join(" ").split(/\s+/).sort()).toEqual(text.split(/\s+/).sort());
  });

  it("honours explicit newlines", () => {
    const lines = wrapText("line one\nline two", 12, 1000);
    expect(lines).toEqual(["line one", "line two"]);
  });

  it("hard-breaks a single word longer than the line", () => {
    const long = "x".repeat(200);
    const lines = wrapText(long, 12, 60);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measureText(line, 12)).toBeLessThanOrEqual(60 + 0.001);
    }
    expect(lines.join("")).toBe(long);
  });
});

describe("columnWidths", () => {
  it("splits the content width evenly when no columns given", () => {
    expect(columnWidths(4, 400)).toEqual([100, 100, 100, 100]);
  });

  it("returns an empty array for zero columns", () => {
    expect(columnWidths(0, 400)).toEqual([]);
  });

  it("sums back to the content width", () => {
    const widths = columnWidths(3, 500);
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(500, 5);
  });

  it("honours relative width weights", () => {
    const widths = columnWidths(2, 600, [{ width: 2 }, { width: 1 }]);
    expect(widths[0]).toBeCloseTo(400, 5);
    expect(widths[1]).toBeCloseTo(200, 5);
  });

  it("treats columns without a weight as weight 1", () => {
    const widths = columnWidths(2, 300, [{ width: 2 }]);
    // weights [2, 1] -> 200 / 100
    expect(widths[0]).toBeCloseTo(200, 5);
    expect(widths[1]).toBeCloseTo(100, 5);
    expect(widths[0] + widths[1]).toBeCloseTo(300, 5);
  });
});

describe("alignOffset", () => {
  it("left alignment returns the region start", () => {
    expect(alignOffset("left", 50, 10, 200)).toBe(10);
  });

  it("center alignment centers within the region", () => {
    expect(alignOffset("center", 50, 0, 200)).toBe(75);
  });

  it("right alignment pushes against the region end", () => {
    expect(alignOffset("right", 50, 0, 200)).toBe(150);
  });
});

describe("resolveMargins", () => {
  it("applies the default margin when nothing is given", () => {
    expect(resolveMargins()).toEqual({ top: 48, right: 48, bottom: 48, left: 48 });
  });

  it("overrides only the provided sides", () => {
    expect(resolveMargins({ top: 10 })).toEqual({ top: 10, right: 48, bottom: 48, left: 48 });
  });
});

describe("resolveFontStyle & isBoldStyle", () => {
  it("defaults to normal", () => {
    expect(resolveFontStyle({})).toBe("normal");
  });

  it("maps bold and italic flags", () => {
    expect(resolveFontStyle({ bold: true })).toBe("bold");
    expect(resolveFontStyle({ italic: true })).toBe("italic");
    expect(resolveFontStyle({ bold: true, italic: true })).toBe("bold-italic");
  });

  it("explicit style wins over flags", () => {
    expect(resolveFontStyle({ style: "italic", bold: true })).toBe("italic");
  });

  it("detects bold styles", () => {
    expect(isBoldStyle("bold")).toBe(true);
    expect(isBoldStyle("bold-italic")).toBe(true);
    expect(isBoldStyle("italic")).toBe(false);
    expect(isBoldStyle("normal")).toBe(false);
  });
});

describe("lineHeight & page sizes", () => {
  it("computes 1.2x leading", () => {
    expect(lineHeight(10)).toBeCloseTo(12, 5);
  });

  it("knows A4 and letter dimensions", () => {
    expect(PAGE_SIZES.a4.height).toBeGreaterThan(PAGE_SIZES.a4.width);
    expect(PAGE_SIZES.letter.width).toBe(612);
  });

  it("supports legal, a3 and a5 sizes", () => {
    expect(PAGE_SIZES.legal.height).toBe(1008);
    expect(PAGE_SIZES.a3.width).toBeCloseTo(841.89, 2);
    expect(PAGE_SIZES.a5.height).toBeCloseTo(595.28, 2);
  });
});

describe("pageDimensions", () => {
  it("returns portrait dimensions by default", () => {
    expect(pageDimensions("a4")).toEqual(PAGE_SIZES.a4);
  });

  it("swaps width and height in landscape", () => {
    const land = pageDimensions("a4", "landscape");
    expect(land.width).toBeCloseTo(PAGE_SIZES.a4.height, 2);
    expect(land.height).toBeCloseTo(PAGE_SIZES.a4.width, 2);
  });
});

describe("imageSize", () => {
  it("reads PNG dimensions from the IHDR", () => {
    // Minimal PNG header: signature + IHDR length/type + 4x4 dims.
    const data = new Uint8Array(24);
    data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    data.set([0x00, 0x00, 0x00, 0x0d], 8); // IHDR length
    data.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
    data.set([0x00, 0x00, 0x00, 0x40], 16); // width 64
    data.set([0x00, 0x00, 0x00, 0x20], 20); // height 32
    expect(imageSize(data)).toEqual({ width: 64, height: 32 });
  });

  it("returns null for unrecognised bytes", () => {
    expect(imageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
