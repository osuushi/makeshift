import {
  type Affine,
  affinePoint,
  affineVector,
  inverseAffine,
  translationAffine,
} from "../model/affine.js";
import { type CameraState, captureCamera, restoreCamera } from "../model/camera-state.js";
import { EntityVisibility } from "../model/entity-visibility.js";
import { type BenchFocus, benchFocusKey } from "../model/smart-object.js";
import type { SketchEditor } from "./editor.js";
import type { Vector } from "./planes.js";
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

  fileCamera(): CameraState {
    const focus = this.editor.store.benchFocus;
    const parent = focus.inline.length
      ? this.views.get(benchFocusKey({ active: focus.active, inline: [] }))
      : undefined;
    return parent?.camera ?? captureCamera(this.editor.world);
  }

  change(
    previous: BenchFocus,
    active: BenchFocus,
    { replacing, conversionOrigin }: { replacing: boolean; conversionOrigin?: Vector },
  ): void {
    const e = this.editor;
    const world = e.world;
    const currentCamera = captureCamera(world);
    if (replacing) this.views.clear();
    else
      this.views.set(benchFocusKey(previous), {
        camera: currentCamera,
        workspace: world.workspace,
        crossSection: world.crossSection,
        visibility: e.visibility,
        bodiesVisible: e.bodiesVisible,
      });
    const entering =
      active.active === previous.active && active.inline.length === previous.inline.length + 1;
    const next = entering ? undefined : this.views.get(benchFocusKey(active));
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
    const inline = active.inline.at(-1);
    const placement =
      entering && inline
        ? inline.placement.transform
        : conversionOrigin && translationAffine(conversionOrigin);
    const camera = placement ? cameraInSource(currentCamera, placement) : next?.camera;
    restoreCamera(world, camera);
  }
}

function cameraInSource(camera: CameraState, placement: Affine): CameraState {
  const inverse = inverseAffine(placement);
  const up = affineVector(inverse, camera.up);
  const length = Math.hypot(...up);
  return {
    position: affinePoint(inverse, camera.position),
    target: affinePoint(inverse, camera.target),
    up: [up[0] / length, up[1] / length, up[2] / length],
    height: Math.min(10000, Math.max(0.5, camera.height * length)),
  };
}
