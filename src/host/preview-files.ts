import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { safeWrite } from "./safe-write.js";

export async function previewPath(root: string, path: string): Promise<string> {
  const base = await realpath(root);
  const target = await realpath(resolve(base, path));
  const rel = relative(base, target);
  if (rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute(rel))
    throw new Error("Preview files must stay inside their directory.");
  return target;
}
export async function readPreviewData(root: string): Promise<unknown> {
  try {
    const path = await previewPath(root, "data.json");
    const bytes = await readFile(path);
    if (bytes.length > 1024 * 1024) throw new Error("Preview data exceeds 1 MiB.");
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}
export async function writePreviewData(root: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  if (!json || Buffer.byteLength(json) > 1024 * 1024)
    throw new Error("Invalid preview data (limit 1 MiB).");
  await safeWrite(resolve(root, "data.json"), Buffer.from(json), 0o600);
}
