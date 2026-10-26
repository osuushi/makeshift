import * as THREE from "three";
import { continueDecorators } from "../decorators/continuation.js";
import type { SketchDocument } from "../sketch/document.js";
import type { Vector } from "../sketch/planes.js";
import type { Body, BodyGeometry, BodyTransform } from "./body.js";
import type { DisplayDocument } from "./display-document.js";

export const axes: Record<string, Vector> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
export function bodyCenter(bodies: readonly BodyGeometry[]): Vector {
  const box = new THREE.Box3();
  for (const body of bodies) {
    box.expandByPoint(new THREE.Vector3(...body.bounds.slice(0, 3)));
    box.expandByPoint(new THREE.Vector3(...body.bounds.slice(3, 6)));
  }
  return box.getCenter(new THREE.Vector3()).toArray() as Vector;
}
export function placementMatrix(edit: BodyTransform): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeTranslation(...edit.translation)
    .multiply(new THREE.Matrix4().makeTranslation(...edit.pivot))
    .multiply(
      new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(...edit.axis),
        (edit.angle * Math.PI) / 180,
      ),
    )
    .multiply(new THREE.Matrix4().makeTranslation(...(edit.pivot.map((v) => -v) as Vector)));
}
/** Temporary display only. Exact BReps and topology are transformed by the kernel on acceptance. */
export function placedBodies(bodies: readonly Body[], edit: BodyTransform): BodyGeometry[] {
  const matrix = placementMatrix(edit);
  const point = (p: Vector): Vector =>
    new THREE.Vector3(...p).applyMatrix4(matrix).toArray() as Vector;
  const direction = (p: Vector): Vector =>
    new THREE.Vector3(...p).transformDirection(matrix).toArray() as Vector;
  const points = (values: number[]) =>
    values.flatMap((_, i) => (i % 3 ? [] : point(values.slice(i, i + 3) as Vector)));
  const bounds = (box: readonly number[]) => {
    const transformed = new THREE.Box3().setFromPoints(
      Array.from(
        { length: 8 },
        (_, i) =>
          new THREE.Vector3(...point([box[i & 1 ? 3 : 0], box[i & 2 ? 4 : 1], box[i & 4 ? 5 : 2]])),
      ),
    );
    return [...transformed.min.toArray(), ...transformed.max.toArray()];
  };
  return bodies.map((body) => {
    const { brep: _, ...geometry } = body;
    const faces = body.faces.map((face) => ({
      ...face,
      signature: [...face.signature.slice(0, 3), ...point(face.signature.slice(3, 6) as Vector)],
      ...(face.bounds ? { bounds: bounds(face.bounds) } : {}),
      vertices: points(face.vertices),
      normals: face.normals?.flatMap((_, i, values) =>
        i % 3 ? [] : direction(values.slice(i, i + 3) as Vector),
      ),
      plane: face.plane
        ? {
            origin: point(face.plane.origin),
            u: direction(face.plane.u),
            v: direction(face.plane.v),
          }
        : null,
      cylinder: face.cylinder
        ? {
            ...face.cylinder,
            origin: point(face.cylinder.origin),
            axis: direction(face.cylinder.axis),
          }
        : null,
      cone: face.cone
        ? { ...face.cone, apex: point(face.cone.apex), axis: direction(face.cone.axis) }
        : null,
    }));
    const box = new THREE.Box3().setFromPoints(
      faces.flatMap((f) =>
        f.vertices.flatMap((_, i) => (i % 3 ? [] : [new THREE.Vector3().fromArray(f.vertices, i)])),
      ),
    );
    return {
      ...geometry,
      id: edit.duplicate ? `copy-preview/${body.id}` : body.id,
      center: point(body.center),
      bounds: [...box.min.toArray(), ...box.max.toArray()],
      faces,
      edges: body.edges.map((edge) => ({
        ...edge,
        ...(edge.landmarks
          ? {
              landmarks: {
                ...edge.landmarks,
                start: point(edge.landmarks.start),
                end: point(edge.landmarks.end),
                midpoint: point(edge.landmarks.midpoint),
              },
            }
          : {}),
        points: points(edge.points),
        curve: !edge.curve
          ? null
          : edge.curve.kind === "circle"
            ? {
                ...edge.curve,
                center: point(edge.curve.center),
                normal: direction(edge.curve.normal),
              }
            : edge.curve.kind === "arc"
              ? {
                  ...edge.curve,
                  a: point(edge.curve.a),
                  b: point(edge.curve.b),
                  mid: point(edge.curve.mid),
                }
              : { ...edge.curve, a: point(edge.curve.a), b: point(edge.curve.b) },
      })),
    };
  });
}

/** Match client-only rigid body previews with temporary metadata attachments. */
export function placedDocument(document: SketchDocument, edit: BodyTransform): DisplayDocument {
  const bodies = document.bodies ?? [];
  const selected = bodies.filter((body) => edit.ids.includes(body.id));
  const retained = edit.duplicate ? bodies : bodies.filter((body) => !edit.ids.includes(body.id));
  const preview = continueDecorators(
    document,
    { ...document, bodies: [...retained, ...placedBodies(selected, edit)] },
    { kind: "transform-bodies", transform: edit },
  );
  if (!edit.duplicate || !document.guidePoints?.length) return preview;
  return {
    ...preview,
    guidePoints: [
      ...document.guidePoints,
      ...document.guidePoints.flatMap((guide) =>
        guide.anchor.kind !== "sketch-curve" && edit.ids.includes(guide.anchor.body)
          ? [
              {
                ...guide,
                id: `copy-preview/${guide.id}`,
                anchor: { ...guide.anchor, body: `copy-preview/${guide.anchor.body}` },
              },
            ]
          : [],
      ),
    ],
  };
}
