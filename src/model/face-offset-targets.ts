import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import type { BodyFaceOffset, Face } from "./body.js";
import { edgeSectionWidth } from "./edge-finish-direction.js";

export function offsetTargets(
  editor: SketchEditor,
): { targets: BodyFaceOffset["faces"]; faces: Face[] } | null {
  const resolution = editor.modeling.resolve("offset");
  return resolution.available ? resolution.inputs : null;
}
/** Pick an actual surface point near the viewer, including on an inward hole wall. */
export function offsetHandle(
  editor: SketchEditor,
  face: Face,
): { center: Vector; normal: Vector; width?: Vector } {
  if (face.offsetHandle) {
    const width = face.blend ? blendSectionWidth(editor, face) : undefined;
    return { ...face.offsetHandle, width };
  }
  let center = new THREE.Vector3(),
    closest = Infinity,
    front = false;
  for (let i = 0; i < face.vertices.length; i += 9) {
    const a = new THREE.Vector3().fromArray(face.vertices, i);
    const b = new THREE.Vector3().fromArray(face.vertices, i + 3);
    const c = new THREE.Vector3().fromArray(face.vertices, i + 6);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const p = a
      .add(b)
      .add(c)
      .multiplyScalar(1 / 3);
    const distance = p.distanceToSquared(editor.world.camera.position);
    const facing = normal.dot(editor.world.camera.position.clone().sub(p)) > 0;
    if ((facing && !front) || (facing === front && distance < closest)) {
      front = facing;
      closest = distance;
      center = p;
    }
  }
  const cylinder = face.cylinder;
  if (cylinder) {
    const axis = new THREE.Vector3(...cylinder.axis),
      origin = new THREE.Vector3(...cylinder.origin);
    const along = axis.multiplyScalar(center.clone().sub(origin).dot(axis)).add(origin);
    const radial = center.sub(along).normalize();
    center = along.addScaledVector(radial, cylinder.radius);
    return {
      center: center.toArray() as Vector,
      normal: radial.multiplyScalar(cylinder.outward).toArray() as Vector,
    };
  }
  const plane = face.plane;
  if (!plane) throw new Error("Face has no supported offset direction");
  return {
    center: center.toArray() as Vector,
    normal: new THREE.Vector3(...plane.u)
      .cross(new THREE.Vector3(...plane.v))
      .normalize()
      .toArray() as Vector,
  };
}

function blendSectionWidth(editor: SketchEditor, face: Face): Vector | undefined {
  const frame = face.offsetHandle;
  const body = editor.store.data.bodies?.find((b) => b.faces.some((f) => f.id === face.id));
  if (!frame || !body) return undefined;
  const point = new THREE.Vector3(...frame.center),
    closest = new THREE.Vector3();
  const segment = new THREE.Line3();
  let best = Infinity,
    width: Vector | undefined;
  for (const edge of body.edges.filter((e) => face.edges.includes(e.id))) {
    for (let i = 3; i < edge.points.length; i += 3) {
      segment.start.fromArray(edge.points, i - 3);
      segment.end.fromArray(edge.points, i);
      segment.closestPointToPoint(point, true, closest);
      const distance = closest.distanceToSquared(point);
      if (distance >= best) continue;
      best = distance;
      width = edgeSectionWidth(edge, closest.toArray() as Vector, frame.normal);
    }
  }
  return width;
}

export function expandFaceTargets(
  editor: SketchEditor,
  targets: BodyFaceOffset["faces"],
  blend: boolean,
): BodyFaceOffset["faces"] {
  const result = [...targets];
  for (const target of targets) {
    const face = editor.store.data.bodies
      ?.find((b) => b.id === target.body)
      ?.faces.find((f) => f.id === target.face);
    for (const id of (blend ? (face?.blend?.faces ?? face?.chamfer?.faces) : face?.offsetFaces) ??
      [])
      if (!result.some((t) => t.body === target.body && t.face === id))
        result.push({ body: target.body, face: id });
  }
  return result;
}

export type FaceFinish = NonNullable<Face["blend"]> & { chamfer?: boolean; distanceScale?: number };
export function sharedBlend(faces: readonly Face[]): FaceFinish | null {
  const chamfer = faces[0]?.chamfer;
  if (
    chamfer &&
    faces.every((f) => f.chamfer && Math.abs(f.chamfer.distance - chamfer.distance) < 1e-6)
  )
    return {
      radius: chamfer.distance,
      outward: chamfer.outward,
      faces: chamfer.faces,
      chamfer: true,
      distanceScale: chamfer.distanceScale,
    };
  const first = faces[0]?.blend;
  return first && faces.every((f) => f.blend && Math.abs(f.blend.radius - first.radius) < 1e-6)
    ? first
    : null;
}

export function sharedThickness(
  faces: readonly Face[],
  targets: BodyFaceOffset["faces"],
): Face["thickness"] {
  const first = faces[0]?.thickness;
  return first &&
    faces.every((face) => {
      const value = face.thickness;
      return (
        value &&
        Math.abs(value.distance - first.distance) < 1e-7 &&
        value.slope === first.slope &&
        !targets.some((target) => target.face === value.face)
      );
    })
    ? first
    : null;
}
