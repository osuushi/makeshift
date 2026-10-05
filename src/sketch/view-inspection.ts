import { decoratorPreviewLayer } from "../decorators/preview-compositor.js";
import { inspectBodyRendering } from "../model/body-render-inspection.js";
import type { SectionControls } from "../model/section-controls.js";
import { toolCatalog } from "../tools/catalog.js";
import type { SketchEditor } from "./editor.js";
import { inspectPlaneTargets } from "./plane-target-inspection.js";
import { selectionFrame } from "./selection-frame.js";

function decoratorPreviewBounds(world: SketchEditor["world"], fallback = false) {
  const bounds: { body: string; mesh: string; min: number[]; max: number[]; triangles: number }[] =
    [];
  world.scene.traverse((object) => {
    if (
      typeof object.userData.body !== "string" ||
      (fallback
        ? object.userData.previewFallback !== true
        : object.userData.previewCurrent === false) ||
      !object.visible ||
      object.parent?.visible === false ||
      !object.layers.isEnabled(decoratorPreviewLayer)
    )
      return;
    const geometry = (object as import("three").Mesh).geometry;
    if (!geometry?.isBufferGeometry) return;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box)
      bounds.push({
        body: object.userData.body,
        mesh: object.uuid,
        min: box.min.toArray(),
        max: box.max.toArray(),
        triangles: geometry.index
          ? geometry.index.count / 3
          : geometry.attributes.position.count / 3,
      });
  });
  return bounds;
}

export function installViewInspection(editor: SketchEditor, sections: SectionControls): void {
  const world = editor.world;
  // Read-only inspection of accepted geometry and its projection; no hidden edit path.
  Object.defineProperty(window, "makeshiftInspect", {
    value: () => {
      const frame = selectionFrame(editor),
        sketch = editor.sketch;
      return structuredClone({
        document: editor.store.data,
        commands: toolCatalog(editor)
          .results()
          .map(({ id, unavailable }) => ({ id, unavailable })),
        busy: editor.blocked,
        solving: editor.store.working,
        solver: editor.store.statistics,
        preview: editor.candidate,
        decoratorPreviewBounds: decoratorPreviewBounds(world),
        decoratorFallbackBounds: decoratorPreviewBounds(world, true),
        bodyRendering: inspectBodyRendering(world.scene),
        gpuGeometries: world.renderer.info.memory.geometries,
        interaction: editor.interactions.current
          ? { kind: editor.interactions.current.kind, phase: editor.interactions.current.phase }
          : null,
        activePlane: world.active,
        crossSection: world.crossSection,
        sectionSurfaces: sections.surfaceCount,
        sectionCalculating: sections.calculating,
        clipping: world.renderer.clippingPlanes.map((p) => [...p.normal.toArray(), p.constant]),
        planeTargets: inspectPlaneTargets(world),
        activeSketch: editor.sketch?.id ?? null,
        modelingSelection: editor.modeling.targets.map((t) =>
          t.kind !== "profile"
            ? t
            : {
                kind: t.kind,
                sketch: t.sketch,
                key: t.profile.key,
                area: t.profile.area,
                holes: t.profile.holes.length,
              },
        ),
        modelingTool: editor.modeling.tool,
        modelingHover: editor.modeling.hover?.kind ?? null,
        camera: {
          position: world.camera.position.toArray(),
          up: world.camera.up.toArray(),
          target: world.target.toArray(),
          height: world.height,
          near: world.camera.near,
          far: world.camera.far,
          moving: world.cameraMoving,
          navigationPending: world.navigation.active,
          orbitActive: world.orbit.active,
          orbitPivot: world.orbit.active ? world.currentOrbitPivot.toArray() : null,
        },
        selection: [...editor.selectionOwners],
        selectionTargets: editor.selected.targets,
        moveMode: editor.moveMode,
        tool: editor.tool,
        selectedCurves: [...editor.selectedCurves],
        selectedPoint: editor.selected.firstPointKey,
        pointChoice: editor.selected.pointKeys ? [...editor.selected.pointKeys] : null,
        hover: editor.hover,
        snap: editor.snap,
        gridSnap: editor.gridSnap,
        pivot: editor.pivot,
        rotationHandle: sketch && frame ? world.projectLocal(sketch.plane, frame.handle) : null,
        projection: world.activeFrame
          ? {
              origin: world.projectLocal(world.activeFrame, { x: 0, y: 0 }),
              u: world.projectLocal(world.activeFrame, { x: 1, y: 0 }),
              v: world.projectLocal(world.activeFrame, { x: 0, y: 1 }),
            }
          : null,
      });
    },
  });
  Object.defineProperty(window, "makeshiftHistory", { value: () => editor.store.history() });
}
