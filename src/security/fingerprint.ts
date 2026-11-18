import { decode } from "./signatures.js";

/** Draw the 17 by 9 OpenSSH random-art walk from the full SHA-256 fingerprint. */
export function fingerprintTiles(fingerprint: string) {
  const counts = new Uint8Array(153);
  let x = 8,
    y = 4;
  for (let byte of decode(fingerprint.slice(7))) {
    for (let i = 0; i < 4; i++, byte >>= 2) {
      x = Math.max(0, Math.min(16, x + (byte & 1 ? 1 : -1)));
      y = Math.max(0, Math.min(8, y + (byte & 2 ? 1 : -1)));
      counts[y * 17 + x]++;
    }
  }
  return Array.from(counts, (n, i) =>
    i === y * 17 + x
      ? "#bc442c"
      : i === 76
        ? "#248463"
        : n
          ? `#${Math.max(26, 202 - n * 13).toString(16)}${Math.max(47, 218 - n * 13).toString(16)}${Math.max(76, 231 - n * 12).toString(16)}`
          : "#f4f6f8",
  );
}
export function fingerprintSvg(value: string) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="170" height="90" viewBox="0 0 17 9">' +
    fingerprintTiles(value)
      .map(
        (c, i) =>
          `<rect x="${i % 17}" y="${Math.floor(i / 17)}" width="1" height="1" fill="${c}"/>`,
      )
      .join("") +
    "</svg>"
  );
}
