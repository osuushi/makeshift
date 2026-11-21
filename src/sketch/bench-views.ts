import { type CameraState, captureCamera, restoreCamera } from "../model/camera-state.js";
import { EntityVisibility } from "../model/entity-visibility.js";
import type { SketchEditor } from "./editor.js";
import type { World } from "./world.js";

interface BenchView {
  camera: CameraState;
  workspace: World["workspace"];
  crossSection: World["crossSection"];
  visibility: EntityVisibility;
  bodiesVisible: boolean;
}

/** Keep each bench's view in the editor while the drawing is open. */
export class BenchViews {
  private views = new Map<string, BenchView>();
  constructor(private editor: SketchEditor) {}

  change(previous: string, active: string, replacing: boolean): void {
    const e = this.editor;
    const world = e.world;
    if (replacing) this.views.clear();
    else
      this.views.set(previous, {
        camera: captureCamera(world),
        workspace: world.workspace,
        crossSection: world.crossSection,
        visibility: e.visibility,
        bodiesVisible: e.bodiesVisible,
      });
    const next = this.views.get(active);
    e.visibility = next?.visibility ?? new EntityVisibility();
    e.bodiesVisible = next?.bodiesVisible ?? true;
    e.modeling.referencePlane = null;
    e.modeling.memberBody = null;
    e.modeling.targets = [];
    e.modeling.alternatives = [];
    e.modeling.hover = null;
    e.modeling.lastEdgeClick = null;
    e.tool = "select";
    e.creationArmed = false;
    e.selectTargets([]);
    e.pivot = null;
    e.placingPivot = false;
    e.activeHandle = undefined;
    e.selectionAngle = 0;
    e.hover = null;
    e.overlaps = null;
    e.snap = null;
    e.notice = "";
    world.selectedPlane = null;
    world.workspace = next?.workspace ?? null;
    world.crossSection = next?.crossSection ?? null;
    restoreCamera(world, next?.camera);
  }
}
