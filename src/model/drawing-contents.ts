import type { SketchDocument } from "../sketch/document.js";
import type { BenchTab, Drawing } from "./benches.js";
import { documentArchive } from "./document-archive.js";

export type DrawingContents = readonly (readonly [id: string, name: string, geometry: string])[];

/** Cache each bench's current accepted snapshot, without retaining serialization for Undo. */
export class DrawingContentsCache {
  private current = new Map<string, { document: SketchDocument; contents: string }>();
  capture(drawing: Drawing): DrawingContents {
    const next = new Map<string, { document: SketchDocument; contents: string }>();
    const contents = drawing.benches.map(({ id, name, document }) => {
      const existing = this.current.get(id);
      const entry =
        existing?.document === document
          ? existing
          : { document, contents: documentArchive(document) };
      next.set(id, entry);
      return [id, name, entry.contents] as const;
    });
    this.current = next;
    return contents;
  }
}

export function sameDrawingContents(a: DrawingContents, b: DrawingContents): boolean {
  return a.length === b.length && a.every((part, i) => part.every((value, j) => value === b[i][j]));
}

/** Browser renderers see the active geometry only. Keep file comparisons for visited benches. */
export class VisitedBenches {
  private inactive = new Map<string, string>();
  private last: { id: string; document: SketchDocument } | undefined;

  observe(id: string, document: SketchDocument): void {
    if (this.last && this.last.id !== id)
      this.inactive.set(this.last.id, documentArchive(this.last.document));
    this.last = { id, document };
  }

  reset(drawing?: Drawing): void {
    this.inactive = new Map(
      drawing?.benches.map(({ id, document }) => [id, documentArchive(document)]),
    );
    this.last = undefined;
  }

  contents(tabs: readonly BenchTab[]): DrawingContents {
    return tabs.map(({ id, name }) => [
      id,
      name,
      this.last?.id === id ? documentArchive(this.last.document) : (this.inactive.get(id) ?? ""),
    ]);
  }
}
