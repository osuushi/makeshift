import { createHash } from "node:crypto";
import { constants, type Dirent } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import {
  archiveLimits,
  type PortableFiles,
  portablePath,
  validatePortable,
} from "../model/portable-files.js";

interface Entry {
  path: string;
  source: string;
  stamp: string;
  size: number;
}
function stamp(info: Awaited<ReturnType<typeof lstat>>): string {
  return `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
}

async function entries(root: string, legacy: boolean): Promise<Entry[]> {
  root = await realpath(root);
  const result: Entry[] = [];
  let bytes = 0;
  async function walk(directory: string, prefix: string): Promise<void> {
    let children: Dirent[];
    try {
      if ((await realpath(directory)) !== directory)
        throw new Error("Workspace contains a linked directory.");
      children = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    // Python environments are machine-local dependencies, not portable project data.
    // Detect the marker rather than guessing names such as .dxf-venv.
    if (
      prefix.startsWith("workspace/") &&
      children.some((child) => child.name === "pyvenv.cfg" && child.isFile())
    )
      return;
    for (const child of children) {
      const path = `${prefix}/${child.name}`;
      const source = join(directory, child.name);
      const info = await lstat(source);
      // Never follow links or open sockets/devices/FIFOs. Keep these local without
      // letting a tool's runtime files prevent saving the drawing.
      if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) continue;
      portablePath(path);
      if (info.isDirectory()) {
        await walk(source, path);
        continue;
      }
      if (prefix.startsWith("conversations/") && !path.endsWith(".jsonl")) continue;
      bytes += info.size;
      if (bytes > archiveLimits.bytes || result.length >= archiveLimits.files)
        throw new Error("Workspace exceeds archive limits (2 GiB / 60000 files).");
      result.push({ path, source, stamp: stamp(info), size: info.size });
    }
  }
  await walk(legacy ? root : join(root, "workspace"), "workspace");
  if (!legacy) {
    await walk(join(root, "codex", "sessions"), "conversations/codex/sessions");
    await walk(join(root, "codex", "archived_sessions"), "conversations/codex/archived_sessions");
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

export async function workspaceSnapshot(root: string, legacy = false): Promise<PortableFiles> {
  const before = await entries(root, legacy);
  const files: PortableFiles = Object.create(null);
  for (const entry of before) {
    const file = await open(entry.source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      if ((await realpath(entry.source)) !== entry.source)
        throw new Error("Workspace contains a linked path.");
      const info = await file.stat();
      if (!info.isFile() || stamp(info) !== entry.stamp)
        throw new Error("Workspace changed during Save. Try again.");
      files[entry.path] = await file.readFile();
      if (stamp(await file.stat()) !== entry.stamp)
        throw new Error("Workspace changed during Save. Try again.");
    } finally {
      await file.close();
    }
  }
  if (JSON.stringify(before) !== JSON.stringify(await entries(root, legacy)))
    throw new Error("Workspace changed during Save. Try again.");
  validatePortable(files);
  return files;
}

export function workspaceDigest(files: PortableFiles): string {
  const hash = createHash("sha256");
  for (const path of Object.keys(files).sort()) {
    const bytes = files[path];
    hash.update(`${path.length}:${path}:${bytes.length}:`).update(bytes);
  }
  return hash.digest("hex");
}
