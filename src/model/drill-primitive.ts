import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Point } from "../sketch/planes.js";
import { pickFace } from "./body-picking.js";
import { circularExtrusion } from "./circular-extrusion.js";
import type { CircularPlacement } from "./circular-primitive-controls.js";
import { drillDepth } from "./drill-depth.js";
import type { ExtrudeControls } from "./extrude-controls.js";

/** A drill starts on an actual visible planar body face, never on a reference plane. */
export function drillPlane(editor: SketchEditor, screen: Point) {
  const hit = pickFace(editor, screen);
  const body = hit && editor.display.bodies?.find((body) => body.id === hit.body);
  const face = body?.faces.find((face) => face.id === hit?.face);
  return hit && face?.plane
    ? { frame: face.plane, source: { kind: "face" as const, body: hit.body, face: hit.face } }
    : null;
}

export async function createDrill(
  editor: SketchEditor,
  extrude: ExtrudeControls,
  placement: CircularPlacement,
  lease: InteractionLease,
): Promise<void> {
  const source = placement.source;
  const body =
    source?.kind === "face"
      ? editor.store.data.bodies?.find((body) => body.id === source.body)
      : undefined;
  const distance = body ? drillDepth(body, placement.plane) : 0;
  if (!distance) {
    lease.release();
    editor.message = "Choose a planar body face with material behind it";
    editor.refresh();
    return;
  }
  await circularExtrusion(editor, extrude, placement, lease, {
    distance: -distance,
    symmetric: false,
    mode: "subtract",
  });
}
