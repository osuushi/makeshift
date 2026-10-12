import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { ModelRequest } from "../sketch/model-api.js";
import type { Vector } from "../sketch/planes.js";
import type { EdgeMovement, FaceMovement } from "./body.js";

type Targets = (Pick<FaceMovement, "faces"> | Pick<EdgeMovement, "edges">) & { bodyIds?: string[] };
export type TopologyMovement = Targets & Omit<FaceMovement, "faces">;

/** Compose a handle gesture in world space with the preceding valid preview. */
export function composeMovement(
  base: TopologyMovement,
  pivot: Vector,
  direction: Vector,
  rotate: boolean,
  value: number,
): TopologyMovement {
  if (value === 0) return base;
  if (!rotate)
    return {
      ...base,
      translation: base.translation.map((n, i) => n + direction[i] * value) as Vector,
    };
  const delta = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(...direction),
    (value * Math.PI) / 180,
  );
  const rotation = delta
    .clone()
    .multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(...base.axis),
        (base.angle * Math.PI) / 180,
      ),
    )
    .normalize();
  // Use the shortest equivalent axis-angle, including a full-turn identity.
  if (rotation.w < 0) rotation.set(-rotation.x, -rotation.y, -rotation.z, -rotation.w);
  const axis = new THREE.Vector3(rotation.x, rotation.y, rotation.z);
  const sine = axis.length();
  const translation = new THREE.Vector3(...base.pivot)
    .add(new THREE.Vector3(...base.translation))
    .sub(new THREE.Vector3(...pivot))
    .applyQuaternion(delta)
    .add(new THREE.Vector3(...pivot))
    .sub(new THREE.Vector3(...base.pivot));
  return {
    ...base,
    axis: sine < 1e-12 ? direction : (axis.multiplyScalar(1 / sine).toArray() as Vector),
    angle: sine < 1e-12 ? 0 : (2 * Math.atan2(sine, rotation.w) * 180) / Math.PI,
    translation: translation.toArray() as Vector,
  };
}

export function movementIsIdentity(edit: TopologyMovement): boolean {
  return Math.abs(edit.angle) < 1e-10 && edit.translation.every((n) => Math.abs(n) < 1e-10);
}

export function movementTargets(editor: SketchEditor, kind: "faces" | "edges"): Targets | null {
  const resolution = editor.modeling.resolve("move");
  if (!resolution.available) return null;
  const { bodies, faces, edges } = resolution.inputs;
  const bodyIds = bodies.length ? { bodyIds: bodies.map((body) => body.id) } : {};
  if (kind === "faces" && faces.length) return { faces, ...bodyIds };
  if (kind === "edges" && edges.length) return { edges, ...bodyIds };
  return null;
}

export function movementRequest(operation: TopologyMovement): ModelRequest {
  return "faces" in operation
    ? { kind: "move-faces", operation }
    : {
        kind: "move-edges",
        operation: {
          edges: operation.edges,
          ...(operation.bodyIds ? { bodyIds: operation.bodyIds } : {}),
          translation: operation.translation,
        },
      };
}
export function movementCenter(editor: SketchEditor, targets: Targets): Vector | null {
  const box = new THREE.Box3();
  for (const body of editor.store.data.bodies ?? []) {
    if (!targets.bodyIds?.includes(body.id)) continue;
    box.expandByPoint(new THREE.Vector3(...body.bounds.slice(0, 3)));
    box.expandByPoint(new THREE.Vector3(...body.bounds.slice(3, 6)));
  }
  for (const target of "faces" in targets ? targets.faces : targets.edges) {
    const body = editor.store.data.bodies?.find((b) => b.id === target.body);
    const points =
      "face" in target
        ? body?.faces.find((f) => f.id === target.face)?.vertices
        : body?.edges.find((e) => e.id === target.edge)?.points;
    if (points)
      for (let i = 0; i < points.length; i += 3)
        box.expandByPoint(new THREE.Vector3().fromArray(points, i));
  }
  return box.isEmpty() ? null : (box.getCenter(new THREE.Vector3()).toArray() as Vector);
}

/** A planar selected boundary offers a local translation direction, even on a rotated body. */
export function movementNormal(editor: SketchEditor, targets: Targets | null): Vector | null {
  if (!targets || !("edges" in targets)) return null;
  const points: THREE.Vector3[] = [];
  let normal: THREE.Vector3 | null = null;
  for (const target of targets.edges) {
    const edge = editor.store.data.bodies
      ?.find((b) => b.id === target.body)
      ?.edges.find((e) => e.id === target.edge);
    if (!edge?.curve) return null;
    if (edge.curve.kind === "circle") normal = new THREE.Vector3(...edge.curve.normal);
    for (let i = 0; i < edge.points.length; i += 3)
      points.push(new THREE.Vector3().fromArray(edge.points, i));
  }
  const origin = points[0];
  if (!origin) return null;
  if (!normal) {
    const a = points
      .find((p) => p.distanceTo(origin) > 1e-7)
      ?.clone()
      .sub(origin);
    if (!a) return null;
    for (const p of points) {
      const n = a.clone().cross(p.clone().sub(origin));
      if (n.length() > 1e-7) {
        normal = n.normalize();
        break;
      }
    }
  }
  if (!normal || points.some((p) => Math.abs(p.clone().sub(origin).dot(normal)) > 1e-6))
    return null;
  const major = normal.toArray().reduce((a, b) => (Math.abs(a) > Math.abs(b) ? a : b));
  if (major < 0) normal.negate();
  return normal.toArray() as Vector;
}

export function restoredMovement(
  editor: SketchEditor,
  operation: FaceMovement | EdgeMovement,
): TopologyMovement {
  return "faces" in operation
    ? structuredClone(operation)
    : {
        ...structuredClone(operation),
        pivot: movementCenter(editor, operation) ?? [0, 0, 0],
        axis: [1, 0, 0],
        angle: 0,
      };
}
