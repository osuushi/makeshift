import { mkdir, realpath, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { archiveLimits, portablePath, validatePortable } from "../model/portable-files.js";
import type { AgentWorkspace } from "./agent-workspace.js";

/** Copy a reference into the portable workspace without changing the model. */
export async function attachAgentFile(
  workspace: AgentWorkspace,
  name: string,
  base64: string,
): Promise<string> {
  if (typeof name !== "string" || name.includes("/")) throw new Error("Choose a file to attach.");
  portablePath(name);
  if (typeof base64 !== "string" || base64.length > 4 * Math.ceil(archiveLimits.bytes / 3))
    throw new Error("The file exceeds the 2 GiB workspace limit.");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64") !== base64) throw new Error("Invalid attachment encoding.");
  if (bytes.length > archiveLimits.bytes)
    throw new Error("The file exceeds the 2 GiB workspace limit.");
  await workspace.ensure();
  const cwd = workspace.cwd;
  if (!cwd || (await realpath(cwd)) !== cwd) throw new Error("Workspace contains a linked path.");
  const directory = join(cwd, "attachments");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await realpath(directory)) !== directory)
    throw new Error("The attachments directory contains a linked path.");

  const files = await workspace.snapshot();
  const existing = new Set(Object.keys(files).map((path) => path.normalize("NFC").toLowerCase()));
  const extension = extname(name);
  const stem = name.slice(0, name.length - extension.length);
  for (let index = 0; index < 10000; index++) {
    const candidate = index ? `${stem} (${index + 1})${extension}` : name;
    const relative = `attachments/${candidate}`;
    const key = `workspace/${relative}`;
    portablePath(key);
    const folded = key.normalize("NFC").toLowerCase();
    if (existing.has(folded) || [...existing].some((path) => path.startsWith(`${folded}/`)))
      continue;
    validatePortable({ ...files, [key]: bytes });
    try {
      await writeFile(join(directory, candidate), bytes, { flag: "wx", mode: 0o600 });
      await workspace.refresh();
      return relative;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
  }
  throw new Error("Too many attachments with this filename.");
}
