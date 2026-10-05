import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import { arrowWidthAxis } from "../sketch/move-widget/geometry.js";
import type { Point, Vector } from "../sketch/planes.js";
import type { Body, BodyEdgeFinish, Edge } from "./body.js";
import { edgeSurfaceMotion } from "./edge-finish-motion.js";

/** Outward bisector of the incident faces at the picked edge point. */
export function edgeOutward(body: Body, edge: Edge, point: Vector): Vector {
  const p = new THREE.Vector3(...point);
  const outward = new THREE.Vector3();
  for (const face of body.faces.filter((face) => face.edges.includes(edge.id))) {
    let best = Infinity;
    const normal = new THREE.Vector3();
    const triangle = new THREE.Triangle();
    const closest = new THREE.Vector3();
    for (let i = 0; i < face.vertices.length; i += 9) {
      triangle.a.fromArray(face.vertices, i);
      triangle.b.fromArray(face.vertices, i + 3);
      triangle.c.fromArray(face.vertices, i + 6);
      triangle.closestPointToPoint(p, closest);
      const distance = closest.distanceToSquared(p);
      if (distance >= best) continue;
      best = distance;
      triangle.getNormal(normal);
    }
    outward.add(normal);
  }
  return outward.normalize().toArray() as Vector;
}

export function edgeViewportDirection(
  point: Vector,
  movement: Vector,
  project: (point: Vector) => Point,
): Point | null {
  const a = project(point);
  const b = project(point.map((v, i) => v + movement[i]) as Vector);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  // Looking directly along the surface movement axis has no viewport drag direction.
  return length < 1e-6 ? null : { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
}

/** The filleted contour lies in the normal section, perpendicular to the local edge. */
export function edgeSectionWidth(edge: Edge, anchor: Vector, outward: Vector): Vector {
  const tangent = new THREE.Vector3();
  const curve = edge.curve;
  if (curve?.kind === "circle") {
    tangent.crossVectors(
      new THREE.Vector3(...curve.normal),
      new THREE.Vector3(...anchor).sub(new THREE.Vector3(...curve.center)),
    );
  } else if (curve?.kind === "line") {
    tangent.fromArray(curve.b).sub(new THREE.Vector3(...curve.a));
  } else {
    const point = new THREE.Vector3(...anchor),
      closest = new THREE.Vector3();
    const segment = new THREE.Line3();
    let best = Infinity;
    for (let i = 3; i < edge.points.length; i += 3) {
      segment.start.fromArray(edge.points, i - 3);
      segment.end.fromArray(edge.points, i);
      segment.closestPointToPoint(point, true, closest);
      const distance = closest.distanceToSquared(point);
      if (distance >= best) continue;
      best = distance;
      tangent.copy(segment.end).sub(segment.start);
    }
  }
  const width = tangent.cross(new THREE.Vector3(...outward));
  return width.lengthSq() > 1e-12
    ? (width.normalize().toArray() as Vector)
    : arrowWidthAxis(outward);
}

export function selectedEdgeFrame(
  editor: SketchEditor,
  mode: BodyEdgeFinish["mode"],
  restored?: BodyEdgeFinish["edges"],
) {
  const resolution = editor.modeling.resolve(mode);
  const selected = restored
    ? structuredClone(restored)
    : resolution.available
      ? resolution.inputs
      : [];
  if (!selected.length) return null;
  const click = editor.modeling.lastEdgeClick;
  const target =
    selected.find((e) => e.body === click?.body && e.edge === click.edge) ??
    selected[selected.length - 1];
  const body = editor.store.data.bodies?.find((b) => b.id === target?.body);
  const edge = body?.edges.find((e) => e.id === target?.edge);
  if (!body || !edge) return null;
  const i = Math.floor((edge.points.length / 3 - 1) / 2) * 3;
  const anchor =
    click?.body === target.body && click.edge === target.edge
      ? click.point
      : (edge.points.slice(i, i + 3) as Vector);
  const outward = edgeOutward(body, edge, anchor);
  return {
    edges: selected,
    anchor,
    outward,
    width: edgeSectionWidth(edge, anchor, outward),
    motion: edgeSurfaceMotion(body, edge, anchor, outward),
  };
}

export type EdgeFinishFrame = NonNullable<ReturnType<typeof selectedEdgeFrame>>;
