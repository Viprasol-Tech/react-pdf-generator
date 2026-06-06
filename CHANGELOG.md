# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/); versioning
follows [SemVer](https://semver.org/).

## [0.2.0] - 2025

### Added
- **Images.** New `image` block embeds PNG (8-bit RGB/grayscale) and JPEG bytes
  as PDF XObjects, with auto aspect-ratio sizing, width/height overrides,
  content-width clamping, and alignment.
- **Rich text styling.** `text` blocks gain `italic`, full `style`
  (`normal`/`bold`/`italic`/`bold-italic`), `align`, `color` (RGB), and custom
  `lineHeight`. Four Helvetica variants are now embedded.
- **Headings** now support levels 1-6 plus `align` and `color`.
- **Tables** gain per-column widths (as flex weights) and alignment via
  `columns`, optional cell `borders` and `borderColor`, `zebra` row shading,
  and automatic header repetition across page breaks (`repeatHeader`).
- **Lists.** New `list` block renders ordered (numbered) or unordered (bullet)
  lists with configurable indent and color.
- **Dividers.** New `divider` block draws a horizontal rule with configurable
  thickness, color, and spacing.
- **Manual page breaks.** New `pageBreak` block forces a new page.
- **Page numbers.** Opt-in automatic footer via `pageNumbers`, with a
  customizable template (`{page}`, `{total}`), alignment, size, and color.
- **More page sizes & orientation.** Added `legal`, `a3`, `a5`, and a
  document-level `orientation: "portrait" | "landscape"`.
- **Document metadata.** `author` and `subject` are now written to the PDF Info
  dictionary alongside `title`.
- **Binary-safe output.** New `generatePdfBytes` returns a `Uint8Array` and is
  the recommended entry point for documents containing images. The
  `usePdfDownload` hook now uses it internally.
- **New exports** for advanced/SSR use: `generatePdfBytes`, `buildContentStream`,
  `detectImageFormat`, `readPngHeader`, `extractPngIdat`, `imageSize`,
  `pageDimensions`, `alignOffset`, `resolveFontStyle`, `isBoldStyle`, plus the
  `DrawOp` family of types.
- `PdfDownloadButton` gains `onError`, a `generatingLabel`, and improved ARIA
  (`aria-busy`, disabled-while-generating).

### Changed
- `columnWidths` now accepts an optional `columns` argument and treats widths as
  relative weights (equal columns remain the default).
- Heading font sizes rebalanced for the new 6-level scale.

## [0.1.0] - 2025

### Added
- Initial release of react-pdf-generator: Generate downloadable PDFs from React component definitions.
