import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { BodyPivotDrag } from "./body-pivot-drag.js";
import { movementCenter, type movementTargets } from "./topology-movement.js";

export class TopologyMovePivot {
  point: Vector = [0, 0, 0];
  custom = false;
  private selection = "";
  private drag: BodyPivotDrag;
  constructor(
    private editor: SketchEditor,
    handle: HTMLButtonElement,
  ) {
    this.drag = new BodyPivotDrag(
      editor,
      handle,
      () => this.point,
      (point) => {
        this.custom = true;
        this.point = point;
        editor.refresh();
      },
      () => {
        this.custom = false;
        editor.refresh();
      },
    );
  }
  update(targets: ReturnType<typeof movementTargets>, active: boolean): void {
    const key = JSON.stringify(targets);
    if (!active && key !== this.selection) {
      this.selection = key;
      this.custom = false;
    }
    if (!active && !this.custom && targets)
      this.point = movementCenter(this.editor, targets) ?? this.point;
  }
  dispose(): void {
    this.drag.dispose();
  }
}
