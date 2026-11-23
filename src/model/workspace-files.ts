import { base64, decode } from "../security/signatures.js";
import { type PortableFiles, portablePath, validatePortable } from "./portable-files.js";

export interface WorkspaceCommand {
  op: "ls" | "cat" | "write" | "append" | "cp" | "mv" | "rm";
  path?: string;
  to?: string;
  data?: string;
  encoding?: "utf8" | "base64";
}

function workspacePath(path: unknown, root = false): string {
  if (root && (path === undefined || path === "." || path === "")) return "workspace";
  if (typeof path !== "string") throw new Error("Supply a workspace-relative path.");
  const key = `workspace/${path}`;
  portablePath(key);
  return key;
}

/** Directories are implicit in the archive. A failed edit never changes the input map. */
export function workspaceCommand(files: PortableFiles, command: WorkspaceCommand) {
  const { op, data, encoding = "utf8" } = command;
  const path = workspacePath(command.path, op === "ls");
  if (encoding !== "utf8" && encoding !== "base64") throw new Error("Unknown file encoding.");
  const file = files[path];
  if (op === "ls") {
    if (file) throw new Error("Expected a directory.");
    const entries = new Map<string, { name: string; type: string; bytes?: number }>();
    for (const [key, bytes] of Object.entries(files)) {
      if (!key.startsWith(`${path}/`)) continue;
      const [name, child] = key.slice(path.length + 1).split("/");
      entries.set(
        name,
        child ? { name, type: "directory" } : { name, type: "file", bytes: bytes.length },
      );
    }
    if (!entries.size && path !== "workspace") throw new Error("Directory does not exist.");
    return { files, result: [...entries.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  }
  if (op === "cat") {
    if (!file) throw new Error("File does not exist.");
    return {
      files,
      result:
        encoding === "base64"
          ? base64(file)
          : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(file),
    };
  }
  const next = { ...files };
  if (op === "write" || op === "append") {
    if (typeof data !== "string") throw new Error("Supply file data.");
    const bytes = encoding === "base64" ? decode(data) : new TextEncoder().encode(data);
    if (op === "append" && file) {
      const combined = new Uint8Array(file.length + bytes.length);
      combined.set(file);
      combined.set(bytes, file.length);
      next[path] = combined;
    } else next[path] = bytes;
  } else {
    if (!file) throw new Error("Expected an existing file.");
    if (op === "cp" || op === "mv") next[workspacePath(command.to)] = file;
    else if (op !== "rm") throw new Error("Unknown workspace operation.");
    if (op === "rm" || (op === "mv" && command.to !== command.path)) delete next[path];
  }
  validatePortable(next);
  return { files: next, result: { ok: true } };
}
