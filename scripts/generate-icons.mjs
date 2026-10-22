import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// macOS authoring utility; generated assets are committed for all build hosts.
const source = "assets/branding/makeshift-icon.png";
const temporary = await mkdtemp(join(tmpdir(), "makeshift-icons-"));
const resize = (size, output, input = source) =>
  execFileSync("sips", ["-z", String(size), String(size), input, "--out", output], {
    stdio: "ignore",
  });
async function icns(name, input) {
  const iconset = join(temporary, `${name}.iconset`);
  await mkdir(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    resize(size, join(iconset, `icon_${size}x${size}.png`), input);
    resize(size * 2, join(iconset, `icon_${size}x${size}@2x.png`), input);
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", `packaging/icons/${name}.icns`]);
}
try {
  await mkdir("packaging/icons", { recursive: true });
  await mkdir("assets/public", { recursive: true });
  await icns("makeshift", source);
  await icns("makeshift-document", "assets/branding/document-icon/makeshift-document.png");
  resize(512, "assets/public/makeshift.png");
  resize(180, "assets/public/apple-touch-icon.png");
  // ICO directory with PNG payloads, supported by modern Windows/Electron.
  const sizes = [16, 32, 48, 64, 128, 256];
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  const images = [];
  let offset = header.length;
  for (const [index, size] of sizes.entries()) {
    const path = join(temporary, `${size}.png`);
    resize(size, path);
    const png = await readFile(path);
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size % 256;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    images.push(png);
    offset += png.length;
  }
  await writeFile("packaging/icons/makeshift.ico", Buffer.concat([header, ...images]));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
