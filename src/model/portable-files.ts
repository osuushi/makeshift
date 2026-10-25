/** Portable data only; machine state never belongs in this map. */
export type PortableFiles = Record<string, Uint8Array>;
// Keep total encoded bytes and entry counts within classic ZIP limits (no ZIP64 writer).
export const archiveLimits = { bytes: 2 * 1024 * 1024 * 1024, files: 60_000, path: 512 };

export function portablePath(path: string): void {
  const segments = path.split("/");
  if (
    !path ||
    path.length > archiveLimits.path ||
    /[\\:]/.test(path) ||
    [...path].some((char) => char.charCodeAt(0) < 32) ||
    segments.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
    )
  )
    throw new Error(`Unsupported archive path: ${path}`);
}

export function validatePortable(files: PortableFiles): void {
  const names = new Set<string>();
  let size = 0;
  if (Object.keys(files).length > archiveLimits.files) throw new Error("Too many workspace files.");
  for (const [path, data] of Object.entries(files)) {
    portablePath(path);
    if (
      !(
        path.startsWith("workspace/") ||
        /^conversations\/codex\/(sessions|archived_sessions)\/.+\.jsonl$/.test(path)
      )
    )
      throw new Error(`Unsupported portable content: ${path}`);
    const key = path.normalize("NFC").toLowerCase();
    if (names.has(key)) throw new Error(`Conflicting archive paths: ${path}`);
    names.add(key);
    size += data.byteLength;
  }
  for (const path of names) {
    const segments = path.split("/");
    for (let i = 1; i < segments.length; i++)
      if (names.has(segments.slice(0, i).join("/")))
        throw new Error("File/directory path conflict.");
  }
  if (size > archiveLimits.bytes) throw new Error("Workspace exceeds the 2 GiB archive limit.");
}
