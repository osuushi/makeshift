import type { SketchEditor } from "../sketch/editor.js";

/** Read presentation and accepted/temporary geometry without completing an edit. */
export function fixtureSnapshot(editor: SketchEditor) {
  return {
    document: editor.store.data,
    preview: editor.candidate,
    backendCandidate: editor.store.candidate,
    lastEdit: editor.store.lastEdit,
    measurements: {
      offsetDistance: editor.store.offsetDistance,
      edgeSize: editor.store.edgeSize,
    },
    error: editor.message,
    notice: editor.notice,
    interaction: editor.interactions.current
      ? {
          kind: editor.interactions.current.kind,
          phase: editor.interactions.current.phase,
        }
      : null,
    modelingSelection: editor.modeling.targets,
    sketchSelection: editor.selected.targets,
    activePlane: editor.world.activeFrame,
    crossSection: editor.world.crossSection,
    partialSection: editor.world.partialSection,
    bodiesVisible: editor.bodiesVisible,
    tool: editor.tool,
    hiddenEntities: editor.visibility.hiddenIds(editor.store.data),
    camera: {
      position: editor.world.camera.position.toArray(),
      up: editor.world.camera.up.toArray(),
      target: editor.world.target.toArray(),
      height: editor.world.height,
    },
  };
}
