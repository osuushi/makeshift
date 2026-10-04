import type { SketchEditor } from "../sketch/editor.js";
import type { ArchiveWork } from "./archive-worker.js";
import type { PortableArchive } from "./portable-archive.js";

/** A disposable codec worker keeps upload/download work off the UI thread. */
export class BrowserArchive {
  private worker: Worker | null = null;
  private reject: ((error: Error) => void) | null = null;
  async run(work: ArchiveWork, editor: SketchEditor): Promise<PortableArchive | Uint8Array> {
    if (this.worker) throw new Error("Finish the file operation first.");
    editor.store.busy = true;
    editor.message = work.kind === "read" ? "Opening document…" : "Saving document…";
    editor.refresh();
    try {
      return await new Promise((resolve, reject) => {
        this.reject = reject;
        const worker = new Worker(new URL("./archive-worker.ts", import.meta.url), {
          type: "module",
        });
        this.worker = worker;
        worker.onmessage = (
          event: MessageEvent<{ result: PortableArchive | Uint8Array; error?: string }>,
        ) => {
          if (event.data.error) reject(new Error(event.data.error));
          else resolve(event.data.result);
        };
        worker.onerror = () => reject(new Error("Could not process document archive."));
        worker.postMessage(work);
      });
    } finally {
      this.terminate();
      editor.store.busy = false;
      editor.message = "";
      editor.refresh();
    }
  }
  dispose(): void {
    this.reject?.(new Error("File operation was closed."));
    this.terminate();
  }
  private terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.reject = null;
  }
}

export function downloadArchive(data: Uint8Array, filename = "Untitled.makeshift"): void {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(data)], { type: "application/octet-stream" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
