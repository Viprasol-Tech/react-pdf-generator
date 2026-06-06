<div align="center">

<img src="docs/assets/logo.png" alt="Viprasol Tech" width="120" />

# react-pdf-generator

**Generate downloadable PDFs from React component definitions — zero runtime dependencies.**

_Built and maintained by [Viprasol Tech](https://viprasol.com)._

[![CI](https://github.com/Viprasol-Tech/react-pdf-generator/actions/workflows/ci.yml/badge.svg)](https://github.com/Viprasol-Tech/react-pdf-generator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/react-pdf-generator.svg)](https://www.npmjs.com/package/react-pdf-generator)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)

</div>

---

## Features

- **Real PDF writer, no heavy dependency.** Emits a valid `%PDF-1.4` document with a proper object table, cross-reference (xref) table, and trailer. Output opens in any standard PDF viewer.
- **Data-driven documents.** Describe a doc as plain, serializable data — headings, text blocks, tables, and spacers.
- **Genuine layout engine.** Text width is measured from the Helvetica AFM metric tables; long lines wrap (and long words hard-break) to the page width; content paginates automatically across A4 or Letter pages.
- **React hook + component.** `usePdfDownload()` wires generation to a browser download; `<PdfDownloadButton />` is a drop-in button.
- **Strictly typed.** TypeScript `strict` mode, full `.d.ts` output, zero runtime dependencies.

## Install

```bash
npm i react-pdf-generator
```

React 18+ is a peer dependency.

## Usage

```tsx
import { PdfDownloadButton, usePdfDownload, type PdfDoc } from "react-pdf-generator";

const invoice: PdfDoc = {
  title: "Invoice #1024",
  pageSize: "a4",
  blocks: [
    { type: "heading", text: "Invoice #1024", level: 1 },
    { type: "text", text: "Billed to: Acme Corp" },
    { type: "spacer", height: 12 },
    {
      type: "table",
      header: ["Item", "Qty", "Price"],
      rows: [
        ["Widget", "3", "9.99"],
        ["Gadget", "1", "19.50"],
      ],
    },
  ],
};

export function InvoiceScreen() {
  // Option A: the ready-made button
  return <PdfDownloadButton doc={invoice} filename="invoice-1024.pdf">Download invoice</PdfDownloadButton>;
}

export function CustomTrigger() {
  // Option B: drive it yourself with the hook
  const { download, toBlob, generating } = usePdfDownload();
  return (
    <button onClick={() => download(invoice, "invoice-1024.pdf")} disabled={generating}>
      {generating ? "Generating..." : "Save PDF"}
    </button>
  );
}
```

Need the bytes server-side or for a custom upload? Call the pure functions directly:

```ts
import { generatePdf, pdfToBytes } from "react-pdf-generator";

const pdfString = generatePdf(invoice); // starts with "%PDF-1.4"
const bytes = pdfToBytes(pdfString);     // Uint8Array, ready to write to disk
```

## API

### Document model

| Block type | Fields | Description |
| ---------- | ------ | ----------- |
| `text` | `text`, `fontSize?`, `bold?` | A paragraph; wraps to the content width. |
| `heading` | `text`, `level?` (1-3) | Larger, bold text with surrounding spacing. |
| `table` | `header?`, `rows`, `fontSize?` | Even-width columns; cells wrap per column. |
| `spacer` | `height` | Vertical empty space in points. |

`PdfDoc` also accepts `title`, `pageSize` (`"a4"` \| `"letter"`), and partial `margins`.

### `usePdfDownload()`

| Member | Type | Description |
| ------ | ---- | ----------- |
| `download` | `(doc, filename?) => void` | Generate and trigger a browser download. |
| `toBlob` | `(doc) => Blob` | Produce a `application/pdf` `Blob` without downloading. |
| `generating` | `boolean` | True while a download is in progress. |
| `error` | `Error \| null` | The last generation error, if any. |

### `<PdfDownloadButton />`

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `doc` | `PdfDoc` | — | The document to generate on click. |
| `filename` | `string` | `"document.pdf"` | Download filename. |
| `onDownloaded` | `() => void` | — | Called after a download is triggered. |
| `children` | `ReactNode` | `"Download PDF"` | Button label. |

All other standard `<button>` attributes are forwarded.

### Layout helpers (also exported)

`measureText`, `wrapText`, `columnWidths`, `lineHeight`, `resolveMargins`, `PAGE_SIZES`, `generatePdf`, `layoutDocument`, `pdfToBytes`.

## A note on fonts

The writer uses the two standard PDF base-14 fonts (Helvetica and Helvetica-Bold), so no font files are embedded and the output stays tiny. Text widths come from the corresponding Adobe Font Metrics tables, which keeps wrapping and pagination accurate without a font-parsing dependency.

## Contributing

Issues and pull requests are welcome. Please run `npm run typecheck` and `npm test` before opening a PR. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Contact — Viprasol Tech Private Limited

- Website: [viprasol.com](https://viprasol.com)
- Email: [support@viprasol.com](mailto:support@viprasol.com)
- Telegram: [t.me/viprasol_help](https://t.me/viprasol_help) | WhatsApp: +91 96336 52112
- GitHub: [@Viprasol-Tech](https://github.com/Viprasol-Tech) | [LinkedIn](https://www.linkedin.com/in/viprasol/) | X [@viprasol](https://twitter.com/viprasol)

## License

[MIT](LICENSE) (c) 2025 Viprasol Tech Private Limited
