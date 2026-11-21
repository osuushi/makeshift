import { strFromU8, strToU8, unzipSync, zipSync } from "three/addons/libs/fflate.module.js";
import { migrateNames } from "../security/legacy-names.js";
import type { Seals } from "../security/signatures.js";
import { type FileArchive, readFileArchive } from "./document-archive.js";
import {
  archiveLimits,
  type PortableFiles,
  portablePath,
  validatePortable,
} from "./portable-files.js";
import { zipChecksum } from "./zip-integrity.js";

function envelopeSeals(value: unknown): { seals?: Seals } {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid content signature envelope.");
  return { seals: value as Seals };
}
export interface PortableArchive extends FileArchive {
  files: PortableFiles;
}

export function writePortableArchive(
  model: string,
  files: PortableFiles,
  seals: Seals = {},
): Uint8Array {
  validatePortable(files);
  const portable = Object.keys(files).length > 0;
  let data: Uint8Array;
  const { version, document, camera, benches, activeBench } = JSON.parse(model);
  if (
    version === 4 ||
    portable ||
    document.decoratorDefinitions?.length ||
    Object.keys(seals).length
  ) {
    data = strToU8(
      JSON.stringify({
        format: "makeshift",
        ...(version === 4 ? { version, benches, activeBench } : { version: 3, document }),
        camera,
        ...(Object.keys(seals).length ? { seals } : {}),
      }),
    );
  } else data = strToU8(model);
  if (
    data.length + Object.values(files).reduce((sum, file) => sum + file.length, 0) >
    archiveLimits.bytes
  )
    throw new Error("Document exceeds the 2 GiB archive limit.");
  return portable ? zipSync({ "model.json": data, ...files }, { level: 0 }) : data;
}

export function readPortableArchive(data: Uint8Array): PortableArchive {
  // Both ZIP headers contain the UTF-8 path (at most 3 bytes per UTF-16 code unit).
  if (
    data.length >
    archiveLimits.bytes + archiveLimits.files * (98 + 6 * archiveLimits.path) + 1024
  )
    throw new Error("Document is too large.");
  if (data[0] !== 0x50 || data[1] !== 0x4b) {
    if (data.length > archiveLimits.bytes)
      throw new Error("Document exceeds the 2 GiB archive limit.");
    return portableArchive(readFileArchive(strFromU8(data)), {});
  }
  const checks = checkZip(data);
  const entries = unzipSync(data);
  for (const [path, check] of checks) {
    const bytes = entries[path];
    if (!bytes || bytes.length !== check.size || zipChecksum(bytes) !== check.crc)
      throw new Error(`Damaged archive entry: ${path}`);
  }
  const model = entries["model.json"];
  if (!model) throw new Error("Missing model.json.");
  const parsed = readFileArchive(strFromU8(model), true);
  delete entries["model.json"];
  validatePortable(entries);
  return portableArchive(parsed, entries);
}

function portableArchive(archive: FileArchive, files: PortableFiles): PortableArchive {
  const drawing = archive.drawing;
  return {
    ...archive,
    document: migrateNames(archive.document),
    ...(drawing
      ? {
          drawing: {
            ...drawing,
            benches: drawing.benches.map((bench) => ({
              ...bench,
              document: migrateNames(bench.document),
            })),
          },
        }
      : {}),
    ...envelopeSeals(archive.seals),
    files,
  };
}

/** Check central metadata before decompression, including symlinks and zip bombs. */
function checkZip(data: Uint8Array): Map<string, { size: number; crc: number }> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = data.length - 22;
  while (end >= Math.max(0, data.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50)
    throw new Error("Invalid ZIP directory.");
  const count = view.getUint16(end + 10, true);
  if (
    view.getUint32(end + 4, true) !== 0 ||
    count !== view.getUint16(end + 8, true) ||
    count > archiveLimits.files + 1
  )
    throw new Error("Unsupported ZIP layout.");
  let offset = view.getUint32(end + 16, true),
    total = 0;
  const names = new Set<string>();
  const checks = new Map<string, { size: number; crc: number }>();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("Invalid ZIP entry.");
    const length = view.getUint16(offset + 28, true);
    const next =
      offset + 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (next > end) throw new Error("Invalid ZIP entry length.");
    const path = strFromU8(data.subarray(offset + 46, offset + 46 + length));
    portablePath(path);
    const mode = (view.getUint32(offset + 38, true) >>> 16) & 0xf000;
    if ((mode !== 0 && mode !== 0x8000) || view.getUint16(offset + 8, true) & 1 || names.has(path))
      throw new Error("Archive must contain unique, unencrypted regular files.");
    names.add(path);
    checks.set(path, {
      size: view.getUint32(offset + 24, true),
      crc: view.getUint32(offset + 16, true),
    });
    total += view.getUint32(offset + 24, true);
    if (total > archiveLimits.bytes) throw new Error("Expanded archive exceeds 2 GiB.");
    offset = next;
  }
  if (offset !== end || view.getUint32(end + 12, true) + view.getUint32(end + 16, true) !== end)
    throw new Error("Unsupported ZIP directory layout.");
  return checks;
}
