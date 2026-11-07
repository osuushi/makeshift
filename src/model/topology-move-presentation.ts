import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import type { BodyGizmo } from "./body-gizmo.js";
import { movementNormal, type movementTargets } from "./topology-movement.js";

export function createTopologyMoveActions(
  gizmo: BodyGizmo,
  kind: "faces" | "edges",
  finish: () => void,
  cancel: () => void,
): { accept: HTMLButtonElement; cancelButton: HTMLButtonElement } {
  gizmo.root.classList.add(
    "topology-move-gizmo",
    kind === "faces" ? "face-move-gizmo" : "edge-move-gizmo",
  );
  gizmo.pivot.title = "Drag to reposition the movement pivot; click to reset";
  const accept = document.createElement("button");
  accept.innerHTML = '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>';
  accept.setAttribute("aria-label", `Accept ${kind === "faces" ? "face" : "edge"} movement`);
  accept.className = "face-move-accept";
  accept.onclick = finish;
  const cancelButton = document.createElement("button");
  cancelButton.innerHTML = '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M6 18 18 6"/></svg>';
  cancelButton.setAttribute("aria-label", `Cancel ${kind === "faces" ? "face" : "edge"} movement`);
  cancelButton.className = "face-move-cancel";
  cancelButton.onclick = cancel;
  gizmo.root.append(accept, cancelButton);
  return { accept, cancelButton };
}

/** Presentation of the face/edge movement controls during preview and scaling. */
export function updateTopologyMovePresentation(
  editor: SketchEditor,
  gizmo: BodyGizmo,
  kind: "faces" | "edges",
  targets: ReturnType<typeof movementTargets>,
  pivot: Vector,
  lease: InteractionLease | null,
  valid: boolean,
  running: boolean,
  changed: boolean,
  invalid: boolean,
  accept: HTMLButtonElement,
  cancel: HTMLButtonElement,
): void {
  const current = editor.interactions.current;
  gizmo.root.hidden =
    !!editor.world.active ||
    editor.modeling.tool !== "move" ||
    (!targets && !lease) ||
    (!!current &&
      current.kind !== (kind === "faces" ? "face-move" : "edge-move") &&
      current.kind !== "body-move" &&
      current.kind !== "scale");
  gizmo.input.hidden = !lease;
  accept.hidden = cancel.hidden = !lease;
  accept.disabled = !valid || running || !changed;
  gizmo.root.dataset.geometryInvalid = String(invalid);
  gizmo.root.setAttribute("aria-busy", String(running));
  gizmo.input.setAttribute("aria-invalid", String(invalid));
  gizmo.update(editor, pivot, false, kind === "edges", movementNormal(editor, targets));
}
