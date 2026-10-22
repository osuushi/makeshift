import type { ScaleSource } from "../model/scale.js";
import { boxMoveRequest, previewBoxMove } from "../model/transform-box-preview.js";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";

/** Rigid/component Move keeps its one-edit release behavior. */
export async function acceptGuideMove(
  editor: SketchEditor,
  source: ScaleSource,
  origin: Vector,
  point: Vector,
  duplicate: boolean,
  lease: InteractionLease,
): Promise<void> {
  const delta = point.map((v, i) => v - origin[i]) as Vector;
  const request = boxMoveRequest(editor.store.data, source, origin, delta, duplicate);
  if (!request) return;
  if (request.kind === "accept") {
    const valid = await previewBoxMove(editor, source, origin, delta, lease);
    if (!valid || lease.phase !== "waiting") return;
  }
  if (!lease.close()) return;
  if (request.kind === "accept") await editor.accept();
  else await editor.store.request(request);
}
