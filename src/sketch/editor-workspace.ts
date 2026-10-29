import type { ConstructionPlane } from "../model/construction-plane.js";
import { toolCatalog } from "../tools/catalog.js";
import type { CameraFraming } from "./camera-motion.js";
import { newId, samePlane } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { installCameraDepth } from "./editor-camera-depth.js";
import { selectedFaceWorkspace } from "./face-workspace.js";
import { modelingSketch } from "./model-selection.js";
import { orbitPivot } from "./orbit-pivot.js";
import { type PlaneId, planeIds, planes } from "./planes.js";
import { profileFraming } from "./profile-framing.js";
import { rollSelectionPivot } from "./roll-pivot.js";
import type { World } from "./world.js";

/** All deliberate sketch entry uses the same idle boundary; history restores context separately. */
export class WorkspaceEntry {
  selectedConstructionPlane: () => ConstructionPlane | undefined = () => undefined;
  constructor(private editor: SketchEditor) {}

  reason(): string | null {
    if (this.editor.isDragging) return "Finish the current drag first";
    if (this.editor.blocked) return "Wait for the current calculation";
    return this.editor.interactions.current ? "Finish or cancel the current edit first" : null;
  }

  enter(workspace: NonNullable<World["workspace"]>, framing?: CameraFraming): boolean {
    if (this.reason()) return false;
    const sketches = this.editor.store.data.sketches;
    const existing =
      sketches.find((sketch) => sketch.id === workspace.sketchId) ??
      sketches.find(
        (sketch) =>
          this.editor.visibility.visible(sketch.id) && samePlane(sketch.plane, workspace.frame),
      );
    if (existing && existing.id !== workspace.sketchId)
      workspace = {
        key: `Sketch ${sketches.indexOf(existing) + 1}`,
        frame: existing.plane,
        sketchId: existing.id,
      };
    this.editor.world.enterWorkspace(workspace, framing);
    this.editor.modeling.targets = [];
    this.editor.modeling.alternatives = [];
    this.editor.refresh();
    return true;
  }

  /** Resolve deliberate tool entry just like the Sketch command, without creating geometry. */
  fromContext(): boolean {
    if (this.reason()) return false;
    const editor = this.editor;
    if (editor.world.active) return true;
    if (modelingSketch(editor)) return this.selected();
    if (selectedFaceWorkspace(editor)) return this.selected();
    const constructionPlane = this.selectedConstructionPlane();
    if (constructionPlane)
      return this.enter({
        key: "Construction plane",
        frame: structuredClone(constructionPlane.frame),
      });
    if (editor.world.selectedPlane) return this.canonical(editor.world.selectedPlane);
    const primary =
      planeIds.find((id) => editor.world.canonicalVisibility.states[id].role === "primary") ?? "XY";
    return this.canonical(primary);
  }

  canonical(id: PlaneId): boolean {
    return this.enter({ key: id, frame: planes[id] });
  }

  selected(fresh = false): boolean {
    if (this.reason()) return false;
    const editor = this.editor,
      sketch = modelingSketch(editor),
      target = editor.modeling.targets[0];
    if (!sketch && target?.kind === "face") {
      const selected = selectedFaceWorkspace(editor);
      return (
        !!selected &&
        this.enter(
          { key: "Face sketch", frame: selected.frame, sketchId: newId() },
          selected.framing,
        )
      );
    }
    if (!sketch) return false;
    if (!fresh) editor.visibility.show(sketch.id);
    return this.enter(
      {
        key: fresh
          ? "New sketch"
          : (editor.display.entityPresentation?.find((entry) => entry.id === sketch.id)?.name ??
            `Sketch ${editor.display.sketches.indexOf(sketch) + 1}`),
        frame: sketch.plane,
        sketchId: fresh ? newId() : sketch.id,
      },
      !fresh && target?.kind === "profile"
        ? profileFraming(editor, sketch, target.profile)
        : undefined,
    );
  }
}

/** Changing editing context clears curve intent; history also restores placement. */
export function installWorkspaceSync(editor: SketchEditor): void {
  const world = editor.world;
  installCameraDepth(editor);
  world.orbitPivot = (press) => orbitPivot(editor, press);
  world.rollPivot = () => rollSelectionPivot(editor);
  world.selectWorkspaceSketch = () => {
    const sketch = editor.sketch;
    if (!sketch) return;
    editor.modeling.targets = [{ kind: "sketch", sketch: sketch.id }];
    editor.modeling.alternatives = [];
    editor.modeling.hover = null;
  };
  world.canNavigate = () => !editor.isDragging;
  world.canEnterSketch = () =>
    !editor.interactions.current?.selectsLocally() &&
    !toolCatalog(editor).reason({ reason: () => null });
  world.sketchEntry = (id) => {
    void toolCatalog(editor).invoke(`sketch-${id.toLowerCase()}`);
  };
  let previous: string | null = null;
  editor.world.changed.add(() => {
    const world = editor.world;
    editor.modeling.sync(editor.store.data);
    if (world.active || editor.modeling.targets.length) world.selectedPlane = null;
    const key = world.workspace?.sketchId ?? world.active;
    if (previous === key) return;
    previous = key;
    if (!world.workspace) {
      editor.tool = "select";
      editor.creationArmed = false;
      editor.notice = "";
    }
    editor.moveMode = false;
    editor.pivot = null;
    editor.placingPivot = false;
    editor.hover = null;
    editor.overlaps = null;
    editor.selected.replace([]);
    editor.pointMenu = null;
    editor.pointHover = null;
    editor.constraintHover = null;
    editor.activeHandle = undefined;
    editor.snap = null;
    editor.message = "";
  });
}
