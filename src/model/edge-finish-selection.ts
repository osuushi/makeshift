import type { SketchEditor } from "../sketch/editor.js";
import type { BodyEdgeFinish } from "./body.js";
import { selectedEdgeFrame } from "./edge-finish-direction.js";

/** Selection before editing, expanded chains during editing, and its exit targets. */
export class EdgeFinishSelection {
  edges: BodyEdgeFinish["edges"] = [];
  restored: SketchEditor["modeling"]["targets"] | undefined;
  constructor(private editor: SketchEditor) {}

  idle() {
    const mode = this.editor.modeling.tool;
    if (
      this.editor.world.active ||
      this.editor.interactions.current ||
      (mode !== "fillet" && mode !== "chamfer")
    )
      return null;
    return { mode, frame: selectedEdgeFrame(this.editor, mode) };
  }

  begin(edges: BodyEdgeFinish["edges"], restored: boolean): void {
    this.edges = edges;
    this.restored = restored ? structuredClone(this.editor.modeling.targets) : undefined;
    this.show();
  }
  async expand(mode: BodyEdgeFinish["mode"]): Promise<boolean> {
    const success = await this.editor.store.request({
      kind: "edge-finish-selection",
      operation: { edges: this.edges, mode },
    });
    if (success) this.edges = this.editor.store.edgeSelection;
    return success;
  }
  show(): void {
    this.editor.modeling.targets = this.edges.map((edge) => ({ kind: "edge", ...edge }));
  }
  accept(): void {
    const ids = new Set(this.edges.map((edge) => edge.body));
    this.editor.modeling.targets = (this.editor.store.data.bodies ?? [])
      .filter((body) => ids.has(body.id))
      .map((body) => ({ kind: "body", body: body.id }));
  }
  cancel(): void {
    if (this.restored) this.editor.modeling.targets = this.restored;
    else this.show();
  }
}
