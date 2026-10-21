import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { PointReference } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { fusePoints, makeCoincident, pointLinked, unfusePoints } from "./point-links.js";
import { distance } from "./point-math.js";
import { pointKey } from "./point-query.js";
import { linkedPointCoordinate } from "./point-reference.js";
import { pointSelected } from "./point-selection.js";
import { sketchIcon } from "./sketch-icons.js";

function selectedPointReferences(editor: SketchEditor): PointReference[] {
  return editor.selected.pointHits(editor.sketch).flatMap<PointReference>((hit) => {
    if (!pointSelected(editor, pointKey(hit) ?? "")) return [];
    if (
      hit.kind === "circleCenter" &&
      editor.sketch?.curves.some((c) => c.id === hit.curve && c.kind !== "segment")
    )
      return [{ curve: hit.curve, end: "center" as const }];
    if (hit.kind !== "endpoint") return [];
    const curve = editor.sketch?.curves.find((c) => c.id === hit.endpoint.curve);
    return curve && curve.kind !== "circle" ? [hit.endpoint] : [];
  });
}
export class PointLinkControls {
  private disposers: (() => void)[] = [];
  private readonly root = document.createElement("div");
  private readonly fuse = document.createElement("button");
  private readonly coincident = document.createElement("button");
  private readonly unfuse = document.createElement("button");
  constructor(
    private editor: SketchEditor,
    parent: HTMLElement,
  ) {
    for (const action of ["fuse", "unfuse", "coincident"] as const)
      this.disposers.push(
        toolCatalog(editor).register({
          id: `points-${action}`,
          label:
            action === "coincident"
              ? "Make points coincident"
              : action === "fuse"
                ? "Fuse points"
                : "Unfuse points",
          category: "Constrain",
          reason: () => this.reason(action),
          run: () => this.apply(action),
        }),
      );
    this.root.className = "point-link-actions";
    for (const [button, label] of [
      [this.fuse, "Fuse selected points"],
      [this.unfuse, "Unfuse selected points"],
      [this.coincident, "Make points coincident"],
    ] as const) {
      button.type = "button";
      button.textContent =
        button === this.coincident ? "Coincident" : button === this.unfuse ? "Unfuse" : "Fuse";
      button.setAttribute("aria-label", label);
      button.dataset.action = "point-link";
      button.addEventListener(
        "click",
        () =>
          void toolCatalog(editor).invoke(
            `points-${button === this.coincident ? "coincident" : button === this.fuse ? "fuse" : "unfuse"}`,
          ),
      );
      this.root.append(button);
    }
    parent.append(this.root);
  }
  attach(parent: HTMLElement): void {
    parent.append(this.root);
  }
  update(compact = false): void {
    const points = selectedPointReferences(this.editor),
      sketch = this.editor.sketch;
    const selected = (this.editor.pointMenu?.hits ?? []).filter((h) =>
      pointSelected(this.editor, pointKey(h) ?? ""),
    );
    const supported = points.length === selected.length;
    this.root.hidden = !supported || !points.length;
    const separated =
      !!sketch &&
      points.length === 2 &&
      distance(linkedPointCoordinate(sketch, points[0]), linkedPointCoordinate(sketch, points[1])) >
        1e-7;
    this.coincident.hidden = !separated;
    this.coincident.disabled = this.editor.blocked;
    this.fuse.hidden = separated || compact;
    this.unfuse.replaceChildren(compact ? sketchIcon("unfuse") : document.createTextNode("Unfuse"));
    this.unfuse.title = "Unfuse selected points";
    this.fuse.disabled = this.editor.blocked;
    this.unfuse.hidden = !sketch || !points.some((p) => pointLinked(sketch, p));
    this.unfuse.disabled = this.editor.blocked;
  }
  private reason(action: "fuse" | "unfuse" | "coincident"): string | null {
    const points = selectedPointReferences(this.editor),
      sketch = this.editor.sketch;
    if (!sketch || !points.length) return "Select sketch endpoints or centers";
    const separated =
      points.length === 2 &&
      distance(linkedPointCoordinate(sketch, points[0]), linkedPointCoordinate(sketch, points[1])) >
        1e-7;
    if (action === "coincident" && !separated) return "Select two separated sketch points";
    if (action === "fuse" && (points.length < 2 || separated))
      return "Select coincident sketch points to fuse";
    if (action === "unfuse" && !points.some((p) => pointLinked(sketch, p)))
      return "Select linked sketch points";
    return idleReason(this.editor);
  }
  dispose(): void {
    for (const dispose of this.disposers) dispose();
  }
  private async apply(action: "fuse" | "unfuse" | "coincident"): Promise<void> {
    const { editor } = this,
      sketch = editor.sketch;
    if (!sketch || editor.blocked || editor.isDragging) return;
    try {
      const points = selectedPointReferences(editor);
      const accepted = await editor.editSketch(
        action === "coincident"
          ? makeCoincident(sketch, points)
          : action === "fuse"
            ? fusePoints(sketch, points)
            : unfusePoints(sketch, points),
        action === "coincident"
          ? {
              kind: "pair",
              subject: points[0].curve,
              reference: points[1].curve,
              points: [points[0]],
            }
          : { kind: "direct" },
      );
      if (accepted && action === "coincident" && editor.pointMenu)
        editor.pointMenu = { ...editor.pointMenu, hits: editor.selected.pointHits(editor.sketch) };
    } catch (error) {
      editor.message = error instanceof Error ? error.message : String(error);
    }
    editor.refresh();
  }
}
