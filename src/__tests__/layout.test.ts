import { describe, it, expect } from "vitest";
import {
  PAGE_SIZES,
  columnWidths,
  lineHeight,
  measureText,
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
  it("splits the content width evenly", () => {
    expect(columnWidths(4, 400)).toEqual([100, 100, 100, 100]);
  });

  it("returns an empty array for zero columns", () => {
    expect(columnWidths(0, 400)).toEqual([]);
  });

  it("sums back to the content width", () => {
    const widths = columnWidths(3, 500);
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(500, 5);
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

describe("lineHeight & page sizes", () => {
  it("computes 1.2x leading", () => {
    expect(lineHeight(10)).toBeCloseTo(12, 5);
  });

  it("knows A4 and letter dimensions", () => {
    expect(PAGE_SIZES.a4.height).toBeGreaterThan(PAGE_SIZES.a4.width);
    expect(PAGE_SIZES.letter.width).toBe(612);
  });
});
