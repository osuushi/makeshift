import { arcCircle } from "./arc-geometry.js";
import type { Sketch } from "./document.js";
import type { Drag, Quantity } from "./drag-state.js";
import { distance } from "./point-math.js";
import { rectangleFrame } from "./rectangle-edit.js";

/** Requested dimensions only; displayed/accepted geometry still comes from the solver. */
export function dragDimensions(drag: Drag, candidate: Sketch): Partial<Record<Quantity, number>> {
  const values: Partial<Record<Quantity, number>> = {};
  const group = drag.group;
  if (group) {
    const frame = rectangleFrame(candidate, group);
    values.width = frame.width;
    values.height = frame.height;
    values.angle = (Math.atan2(frame.u.y, frame.u.x) * 180) / Math.PI;
  }
  const id =
    drag.circle ??
    drag.line ??
    drag.bow?.curve ??
    drag.endpoint?.curve ??
    (drag.ids.size === 1 ? [...drag.ids][0] : undefined);
  const curve = candidate.curves.find((curve) => curve.id === id);
  if (curve?.kind === "segment") {
    values.length = distance(curve.a, curve.b);
    values.angle = (Math.atan2(curve.b.y - curve.a.y, curve.b.x - curve.a.x) * 180) / Math.PI;
  } else if (curve?.kind === "circle") values.radius = curve.radius;
  else if (curve?.kind === "arc") values.radius = arcCircle(curve).radius;
  if (drag.mode === "rotate") values.angle = drag.pose + drag.angle;
  return values;
}
