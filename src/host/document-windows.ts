import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { app, type BrowserWindow, screen } from "electron";
import { safeWrite } from "./safe-write.js";

export async function canonicalDocumentPath(path: string): Promise<string> {
  const absolute = resolve(path);
  return realpath(absolute).catch(async () =>
    join(await realpath(dirname(absolute)).catch(() => dirname(absolute)), basename(absolute)),
  );
}

export interface SavedDocumentWindow {
  path: string | null;
  bounds?: Electron.Rectangle;
}

export function cascadeWindow(window?: BrowserWindow): Electron.Rectangle | undefined {
  if (!window || window.isDestroyed()) return;
  const bounds = window.getNormalBounds();
  return windowBounds({ ...bounds, x: bounds.x + 24, y: bounds.y + 24 });
}

export function windowBounds(value: unknown): Electron.Rectangle | undefined {
  const bounds = value as Electron.Rectangle | undefined;
  if (
    !bounds ||
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isSafeInteger) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    return;
  const available = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(bounds.width, available.width),
    height = Math.min(bounds.height, available.height);
  return {
    width,
    height,
    x: Math.max(available.x, Math.min(bounds.x, available.x + available.width - width)),
    y: Math.max(available.y, Math.min(bounds.y, available.y + available.height - height)),
  };
}

/** App-level restoration remembers saved files and window placement, never unsaved geometry. */
export class DocumentWindows {
  directory = app.getPath("documents");
  private file = join(app.getPath("userData"), "document-windows.json");
  private pending: Promise<void> = Promise.resolve();
  get flushed(): Promise<void> {
    return this.pending;
  }
  write(windows: SavedDocumentWindow[]): Promise<void> {
    const bytes = JSON.stringify({ windows, directory: this.directory });
    this.pending = this.pending.catch(console.error).then(() => safeWrite(this.file, bytes));
    return this.pending;
  }
  async read(): Promise<SavedDocumentWindow[]> {
    try {
      const value = JSON.parse(await readFile(this.file, "utf8"));
      if (typeof value.directory === "string" && isAbsolute(value.directory))
        this.directory = value.directory;
      const windows: unknown[] = Array.isArray(value.windows)
        ? value.windows
        : Array.isArray(value.paths)
          ? value.paths.map((path: unknown) => ({ path }))
          : [];
      return windows.flatMap((entry) => {
        const item = entry as SavedDocumentWindow | null;
        if (
          !item ||
          !(item.path === null || (typeof item.path === "string" && isAbsolute(item.path)))
        )
          return [];
        return [{ path: item.path, bounds: windowBounds(item.bounds) }];
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(error);
        return [];
      }
      try {
        const value = JSON.parse(
          await readFile(join(app.getPath("userData"), "document-session.json"), "utf8"),
        );
        if (typeof value.directory === "string" && isAbsolute(value.directory))
          this.directory = value.directory;
        return typeof value.path === "string" && isAbsolute(value.path)
          ? [{ path: value.path }]
          : [];
      } catch {
        return [];
      }
    }
  }
}
