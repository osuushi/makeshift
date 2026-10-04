import { readdir, readFile } from "node:fs/promises";
import { brotliCompressSync, gzipSync } from "node:zlib";

const directory = ".build/web/assets";
const rows = [];
for (const name of await readdir(directory)) {
  if (!/\.(wasm|js|css)$/.test(name)) continue;
  const bytes = await readFile(`${directory}/${name}`);
  rows.push({
    file: name,
    bytes: bytes.length,
    gzip: gzipSync(bytes).length,
    brotli: brotliCompressSync(bytes).length,
  });
}
rows.sort((a, b) => b.bytes - a.bytes);
console.table(rows);
console.log(
  "Compression estimates; actual transfer encoding depends on the static host. WASM calculators load on demand.",
);
