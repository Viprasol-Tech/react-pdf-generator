/**
 * Test fixtures: build real, minimal PNG and JPEG byte streams so the image
 * embedding paths are exercised against genuine image data rather than stubs.
 */

import { deflateSync } from "node:zlib";

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

// CRC32 (used by PNG chunks). Computed fresh each call — fine for tiny fixtures.
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: number[]): number[] {
  const typeBytes = [...type].map((c) => c.charCodeAt(0));
  const body = [...typeBytes, ...data];
  const crc = crc32(new Uint8Array(body));
  return [...u32be(data.length), ...body, ...u32be(crc)];
}

/**
 * Build a valid 8-bit truecolor (RGB, colorType 2) PNG of the given size,
 * filled with one solid color. Scanlines use filter type 0 (none).
 */
export function makePng(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  const ihdr = [
    ...u32be(width),
    ...u32be(height),
    8, // bit depth
    2, // color type: truecolor RGB
    0, // compression
    0, // filter
    0, // interlace
  ];

  // Raw scanlines: each row prefixed by a filter byte (0 = none).
  const raw: number[] = [];
  for (let y = 0; y < height; y++) {
    raw.push(0);
    for (let x = 0; x < width; x++) raw.push(rgb[0], rgb[1], rgb[2]);
  }
  const idat = Array.from(deflateSync(Buffer.from(raw)));

  return new Uint8Array([
    ...signature,
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", idat),
    ...chunk("IEND", []),
  ]);
}

/**
 * A minimal but structurally valid JPEG byte stream. It carries the SOI
 * marker, an APP0/JFIF header, and an SOF0 frame declaring the dimensions —
 * enough for the dimension parser and the embed path to treat it as a JPEG.
 */
export function makeJpeg(width: number, height: number): Uint8Array {
  const sof0 = [
    0xff, 0xc0, // SOF0 marker
    0x00, 0x11, // segment length (17)
    0x08, // precision
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, // components
    0x01, 0x22, 0x00,
    0x02, 0x11, 0x01,
    0x03, 0x11, 0x01,
  ];
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, // APP0 length 16
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    ...sof0,
    0xff, 0xd9, // EOI
  ]);
}
