import type { SketchDocument } from "../sketch/document.js";
import type { HistoryOperation } from "../sketch/operation-history.js";
import { profilesFor } from "../sketch/profiles.js";
import type { Extrusion, LiftSource, Revolution } from "./body.js";

/** Per-window display state; hiding geometry never changes the document. */
export class EntityVisibility {
  readonly hidden = new Set<string>();
  readonly xray = new Set<string>();
  private readonly known = new Set<string>();
  private isolated: Set<string> | null = null;
  /** Observe accepted and preview owners before drawing; existing hidden owners stay hidden. */
  observe(document: {
    sketches: readonly { id: string }[];
    bodies?: readonly { id: string }[];
    constructionPlanes?: readonly { id: string }[];
  }): void {
    for (const entity of [
      ...document.sketches,
      ...(document.bodies ?? []),
      ...(document.constructionPlanes ?? []),
    ]) {
      if (this.known.has(entity.id)) continue;
      this.known.add(entity.id);
      this.isolated?.add(entity.id);
    }
  }
  get isolating(): boolean {
    return this.isolated !== null;
  }
  isolate(ids: Iterable<string>): void {
    this.isolated = new Set(ids);
    for (const id of this.isolated) this.hidden.delete(id);
  }
  endIsolation(): void {
    this.isolated = null;
  }
  show(id: string): void {
    this.hidden.delete(id);
    this.isolated?.add(id);
  }
  hide(id: string): void {
    this.hidden.add(id);
  }
  reset(): void {
    this.hidden.clear();
    this.xray.clear();
    this.known.clear();
    this.isolated = null;
  }
  setUsedSketchesVisible(
    document: SketchDocument,
    sources: readonly LiftSource[],
    visible: boolean,
  ): void {
    for (const sketch of document.sketches) {
      const used = new Set(
        sources.flatMap((source) =>
          "sketch" in source && source.sketch === sketch.id ? [source.profile] : [],
        ),
      );
      if (!used.size) continue;
      const profiles = profilesFor(sketch);
      if (profiles.length && profiles.every((profile) => used.has(profile.key))) {
        if (visible) this.show(sketch.id);
        else this.hide(sketch.id);
      }
    }
  }
  restoreHistory(
    document: SketchDocument,
    operation: HistoryOperation,
    direction: "undo" | "redo",
  ): void {
    if (operation.kind === "erode") {
      const { ids, keepOriginals } = operation.parameters
        .operation as import("./body.js").BodyErosion;
      for (const id of ids) {
        if (direction === "undo") this.show(id);
        else if (keepOriginals !== false) this.hide(id);
      }
    }
    const sweep =
      operation.kind === "extrude"
        ? (operation.parameters.extrusion as Extrusion)
        : operation.kind === "revolve"
          ? (operation.parameters.revolution as Revolution)
          : undefined;
    if (operation.kind === "loft")
      this.setUsedSketchesVisible(
        document,
        (operation.parameters.operation as import("./loft.js").Loft).sources,
        direction === "undo",
      );
    if (sweep) this.setUsedSketchesVisible(document, sweep.sources, direction === "undo");
  }
  visible(id: string): boolean {
    return !this.hidden.has(id) && (!this.isolated || this.isolated.has(id));
  }
  hiddenIds(document: SketchDocument): string[] {
    const ids = [
      ...document.sketches.map((sketch) => sketch.id),
      ...(document.bodies ?? []).map((body) => body.id),
      ...(document.constructionPlanes ?? []).map((plane) => plane.id),
    ];
    return [...new Set([...ids, ...this.hidden])].filter((id) => !this.visible(id));
  }
  get key(): string {
    return `${[...this.hidden].join(",")}|${this.isolated ? [...this.isolated].join(",") : ""}|${this.isolating}`;
  }
}
