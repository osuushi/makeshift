import * as THREE from "three";
import { visibleAnchorPoint } from "../model/anchor-snapping.js";
import type { Face } from "../model/body.js";
import type { DisplayDocument } from "../model/display-document.js";
import type { OverlapTarget } from "../model/overlap-candidates.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type PlaneFrame, type Point, type Vector, worldPoint } from "../sketch/planes.js";
import { near } from "./geometry.js";
import { guideMovePlanes } from "./move-planes.js";
import { guideMovePoints } from "./move-points.js";
import type { GuideAnchor } from "./types.js";

export interface GuideMoveTarget {
  point: Vector;
  label: string;
  reference: OverlapTarget;
  anchor?: GuideAnchor;
  plane?: { frame: PlaneFrame };
  /** Solved signed tool parameter; independent of screen hit distance. */
  distance?: number;
  alignment?: { point: Vector; cylinder?: NonNullable<Face["cylinder"]> };
}
export interface GuideMoveCandidate extends GuideMoveTarget {
  saved: boolean;
  guide?: boolean;
  visible: boolean;
}
export interface GuideMoveProbe {
  target: GuideMoveTarget | null;
  choices: GuideMoveTarget[];
}

/** One frozen pool supplies both visible destinations and their hit testing. */
export function guideMoveTargets(
  editor: SketchEditor,
  document: DisplayDocument,
  origin: Vector,
  sketchPlane?: PlaneFrame,
): GuideMoveCandidate[] {
  const points = guideMovePoints(editor, document).map((p) => {
    let point = p.point;
    if (sketchPlane) {
      const screen = editor.world.project(point),
        local = editor.world.pointAt(sketchPlane, screen.x, screen.y);
      if (local) point = worldPoint(sketchPlane, local);
    }
    return { ...p, point };
  });
  return [
    ...points,
    ...guideMovePlanes(editor, document, origin, sketchPlane).map((p) => ({ ...p, saved: false })),
  ]
    .filter(
      (p) => !near(p.point, origin) && editor.world.visiblePoint(new THREE.Vector3(...p.point)),
    )
    .map((p) => ({
      ...p,
      visible: p.saved || visibleAnchorPoint(editor, p.point, document.bodies),
    }));
}

/** Every snap is acquired at its destination; surfaces have no drag hit area. */
export function guideMoveProbe(
  editor: SketchEditor,
  candidates: GuideMoveCandidate[],
  screen: Point,
): GuideMoveProbe {
  const nearby = candidates
    .map((p) => {
      const q = editor.world.project(p.point);
      return { ...p, screenDistance: Math.hypot(q.x - screen.x, q.y - screen.y) };
    })
    .filter((p) => p.screenDistance <= 10)
    .sort((a, b) => a.screenDistance - b.screenDistance || Number(b.saved) - Number(a.saved));
  const visible = nearby.filter((p) => p.visible);
  const first = visible[0];
  const ambiguous =
    first &&
    visible.some((p) => p.screenDistance - first.screenDistance < 3 && !near(p.point, first.point));
  const depth = (p: GuideMoveTarget) =>
    new THREE.Vector3(...p.point).distanceTo(editor.world.camera.position);
  const choices = nearby
    .filter((p, i, all) => all.findIndex((q) => near(q.point, p.point)) === i)
    .sort((a, b) => depth(a) - depth(b));
  return { target: first && !ambiguous ? first : null, choices };
}
