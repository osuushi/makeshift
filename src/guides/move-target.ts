import * as THREE from "three";
import { visibleAnchorPoint } from "../model/anchor-snapping.js";
import type { DisplayDocument } from "../model/display-document.js";
import type { OverlapTarget } from "../model/overlap-candidates.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type PlaneFrame, type Point, type Vector, worldPoint } from "../sketch/planes.js";
import { near } from "./geometry.js";
import { guideMovePlanes } from "./move-planes.js";
import { type GuideMovePoint, guideMovePoints } from "./move-points.js";
import type { GuideAnchor } from "./types.js";

export interface GuideMoveTarget {
  point: Vector;
  label: string;
  reference: OverlapTarget;
  anchor?: GuideAnchor;
  plane?: { frame: PlaneFrame; vertices: readonly number[] };
}
export interface GuideMoveProbe {
  target: GuideMoveTarget | null;
  choices: GuideMoveTarget[];
}

/** Point targets win normally; a still hold can expose covered points and plane alternatives. */
export function guideMoveProbe(
  editor: SketchEditor,
  document: DisplayDocument,
  origin: Vector,
  screen: Point,
  sketchPlane?: PlaneFrame,
  references = guideMovePoints(editor, document),
): GuideMoveProbe {
  const points = pointTargets(editor, document, origin, screen, references, sketchPlane);
  const planes = guideMovePlanes(editor, document, origin, screen, sketchPlane).filter(
    (p) => !near(p.target.point, origin),
  );
  const visible = points.filter((p) => p.visible);
  const first = visible[0];
  const ambiguous =
    first && visible.some((p) => p.distance - first.distance < 3 && !near(p.point, first.point));
  const depth = (p: GuideMoveTarget) =>
    new THREE.Vector3(...p.point).distanceTo(editor.world.camera.position);
  const choices = [...points, ...planes.map((p) => p.target)]
    .filter((p, i, all) => all.findIndex((q) => near(q.point, p.point)) === i)
    .sort((a, b) => depth(a) - depth(b));
  return {
    target: first ? (ambiguous ? null : first) : (planes.find((p) => p.visible)?.target ?? null),
    choices,
  };
}

function pointTargets(
  editor: SketchEditor,
  document: DisplayDocument,
  origin: Vector,
  screen: Point,
  references: GuideMovePoint[],
  sketchPlane?: PlaneFrame,
) {
  return references
    .map((p) => {
      let point = p.point;
      if (sketchPlane) {
        const screen = editor.world.project(point),
          local = editor.world.pointAt(sketchPlane, screen.x, screen.y);
        if (local) point = worldPoint(sketchPlane, local);
      }
      const q = editor.world.project(point);
      return { ...p, point, distance: Math.hypot(q.x - screen.x, q.y - screen.y) };
    })
    .filter(
      (p) =>
        p.distance <= 10 &&
        !near(p.point, origin) &&
        editor.world.visiblePoint(new THREE.Vector3(...p.point)),
    )
    .map((p) => ({
      ...p,
      visible: p.saved || visibleAnchorPoint(editor, p.point, document.bodies),
    }))
    .sort((a, b) => a.distance - b.distance || Number(b.saved) - Number(a.saved));
}
