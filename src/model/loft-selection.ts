import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { pickModels } from "../sketch/model-selection.js";
import type { LiftSource } from "./body.js";
import { resolveOperation } from "./operation-selection.js";

export function pickLoftSection(
  editor: SketchEditor,
  lease: InteractionLease,
  event: PointerEvent,
  sources: LiftSource[],
): LiftSource | undefined {
  // Pick accepted source geometry rather than a newly generated loft face.
  const candidate = lease.candidate;
  lease.show(null);
  const hits = pickModels(editor, { x: event.clientX, y: event.clientY });
  lease.show(candidate);
  for (const hit of hits) {
    const resolution = resolveOperation("extrude", [hit], editor.store.data);
    if (!resolution.available) continue;
    const source = resolution.inputs[0];
    if (!sources.some((s) => JSON.stringify(s) === JSON.stringify(source))) return source;
  }
  return undefined;
}
