import { decode } from "./signatures.js";

const shapes = [
  ["0011100", "0111110", "1111111", "1111111", "1111111", "0111110", "0011100"],
  ["0001000", "0011100", "0111110", "1111111", "0111110", "0011100", "0001000"],
  ["1111111", "1111111", "1111111", "1111111", "1111111", "1111111", "1111111"],
  ["0001000", "0011100", "0011100", "0111110", "0111110", "1111111", "1111111"],
  ["0011100", "0011100", "1111111", "1111111", "1111111", "0011100", "0011100"],
  ["1111111", "1100011", "1100011", "1100011", "1100011", "1100011", "1111111"],
  ["1100000", "1110000", "0111000", "0011100", "0001110", "0000111", "0000011"],
  ["1111111", "1111111", "0000000", "0000000", "0000000", "1111111", "1111111"],
];
const colors = [
  "#17345c",
  "#a62c49",
  "#b75715",
  "#507518",
  "#00817a",
  "#255dcc",
  "#79399f",
  "#26323b",
];
const background = "#f7f7f2";
const columns = 4;
const cell = 9;
const fingerprintArtSize = columns * cell;

function symbols(fingerprint: string) {
  const bytes = decode(fingerprint.slice(7));
  if (bytes.length !== 32) throw new Error("Expected a SHA-256 fingerprint.");
  return Array.from({ length: 16 }, (_, i) => {
    const pair = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
    // Fold each digest pair into a color and shape for visual comparison.
    const code = (pair ^ (pair >>> 6) ^ (pair >>> 12)) & 63;
    return {
      x: (i % columns) * cell + 1,
      y: Math.floor(i / columns) * cell + 1,
      shape: shapes[code & 7],
      color: colors[code >>> 3],
    };
  });
}

export function fingerprintSvg(value: string) {
  const size = fingerprintArtSize;
  const paths = symbols(value).map(({ x, y, shape, color }) => {
    const path = shape
      .flatMap((row, j) =>
        Array.from(row, (pixel, i) => (pixel === "1" ? `M${x + i} ${y + j}h1v1h-1z` : "")),
      )
      .join("");
    return `<path fill="${color}" d="${path}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${background}"/>${paths.join("")}</svg>`;
}
