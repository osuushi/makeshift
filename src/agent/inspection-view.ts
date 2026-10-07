import {
  applicationPreferences,
  configurePreferences,
} from "../preferences/application-preferences.js";
import type { SketchEditor } from "../sketch/editor.js";
import { worldPoint } from "../sketch/planes.js";

import { pointTarget } from "../sketch/selection-target.js";
import type { InspectionTarget, InspectionView } from "./inspection-protocol.js";
import { changeAgentSelection } from "./selection-command.js";

/** Reads UI-owned selection/camera only; geometry is read from the host's owner. */
export function inspectionView(editor: SketchEditor, render: boolean): InspectionView {
  const world = editor.world;
  if (editor.blocked || editor.candidate || editor.isDragging || editor.interactions.current)
    throw new Error("Finish or cancel the current edit before inspecting accepted geometry.");
  // Decorator fades and other queued paints do not move the camera.
  if (world.cameraTransitioning)
    throw new Error("Wait for the camera to settle, then inspect again.");
  // Use the normal composition path, including decorator and sketch foreground
  // passes, before reading both camera metadata and the transient WebGL buffer.
  if (render) world.draw();
  const sketch = editor.sketch;
  const clippingFrame = world.activeFrame ?? world.crossSection;
  const selection: InspectionTarget[] = world.active
    ? sketch
      ? editor.selected.targets.map((t) => ({ ...t, sketch: sketch.id }))
      : []
    : editor.modeling.targets.map((t) =>
        t.kind === "profile"
          ? { kind: "profile", sketch: t.sketch, profile: t.profile.key }
          : t.kind === "edge"
            ? { kind: "edge", body: t.body, edge: t.edge }
            : { ...t },
      );
  const result: InspectionView = {
    preferences: applicationPreferences(),
    mode: world.active ? "sketch" : "modeling",
    activeSketch: sketch?.id ?? null,
    selection,
    selectedPoints:
      sketch && world.active
        ? editor.selected.pointHits(editor.sketch).flatMap((hit) => {
            const target = pointTarget(hit);
            return target
              ? [
                  {
                    target: { ...target, sketch: sketch.id },
                    position: worldPoint(sketch.plane, hit.point),
                  },
                ]
              : [];
          })
        : [],
    hidden: editor.visibility.hiddenIds(editor.store.data),
    bodiesVisible: editor.bodiesVisible,
    camera: {
      projection: "orthographic",
      position: world.camera.position.toArray(),
      target: world.target.toArray(),
      up: world.camera.up.toArray(),
      height: world.height,
      width: world.camera.right - world.camera.left,
      near: world.camera.near,
      far: world.camera.far,
    },
    clipping: clippingFrame
      ? {
          kind: "visual",
          plane: clippingFrame,
          equations: world.renderer.clippingPlanes.map((p) => [...p.normal.toArray(), p.constant]),
        }
      : null,
  };
  if (render) result.image = captureViewport(editor);
  return structuredClone(result);
}

function captureViewport(editor: SketchEditor): NonNullable<InspectionView["image"]> {
  const world = editor.world;
  // inspectionView just composed this frame. HTML controls remain excluded.
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 2048 / Math.max(world.canvas.width, world.canvas.height));
  canvas.width = Math.max(1, Math.round(world.canvas.width * scale));
  canvas.height = Math.max(1, Math.round(world.canvas.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Viewport image capture is unavailable.");
  context.drawImage(world.canvas, 0, 0, canvas.width, canvas.height);
  return {
    data: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
  };
}

export function installInspection(editor: SketchEditor): () => void {
  return (
    window.makeshiftInspection?.onRequest((render, acquireScript, selection, settings) => {
      let view = inspectionView(editor, render);
      if (selection !== undefined) {
        changeAgentSelection(editor, selection);
        view = inspectionView(editor, render);
      }
      if (settings !== undefined) {
        configurePreferences(settings);
        view = inspectionView(editor, render);
      }
      if (acquireScript) editor.store.scriptState(true);
      return view;
    }) ?? (() => {})
  );
}
