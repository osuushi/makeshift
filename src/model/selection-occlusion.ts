import * as THREE from "three";
import { previewFaceKey } from "../decorators/preview-compositor.js";
import type { SelectionBody } from "./selection-preview-geometry.js";

interface Patch {
  points: THREE.Vector3[];
  bounds: THREE.Box2;
  normal: THREE.Vector3;
}

/** Orthographic projected triangles have affine depth. Testing their overlap polygon
 * finds even tiny blockers between vertices, without sampled visibility rays. */
export function selectionOccluders(
  bodies: readonly SelectionBody[],
  targets: { body: SelectionBody; faces: SelectionBody["faces"] }[],
  camera: THREE.OrthographicCamera,
): Set<string> {
  const view = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  const selected = new Set(
    targets.flatMap(({ body, faces }) => faces.map((f) => previewFaceKey(body.id, f.id))),
  );
  const patches = targets.flatMap(({ faces }) =>
    faces.flatMap((face) => {
      const all = [...projectFace(face, view)];
      const front = all.filter((patch) => patch.normal.z > 1e-14);
      return front.length ? front : all;
    }),
  );
  const index = new PatchIndex(patches);
  const hidden = new Set<string>();
  if (!patches.length) return hidden;
  const tolerance = 2e-4 / (camera.far - camera.near);
  for (const body of bodies)
    for (const face of body.faces) {
      const key = previewFaceKey(body.id, face.id);
      if (selected.has(key)) continue;
      for (const patch of projectFace(face, view)) {
        if (index.query(patch.bounds).some((target) => blocks(patch, target, tolerance))) {
          hidden.add(key);
          break;
        }
      }
    }
  return hidden;
}

function* projectFace(face: SelectionBody["faces"][number], view: THREE.Matrix4): Generator<Patch> {
  for (let i = 0; i < face.vertices.length; i += 9) {
    const points = [0, 3, 6].map((j) =>
      new THREE.Vector3().fromArray(face.vertices, i + j).applyMatrix4(view),
    );
    const normal = new THREE.Vector3().crossVectors(
      points[1].clone().sub(points[0]),
      points[2].clone().sub(points[0]),
    );
    if (Math.abs(normal.z) < 1e-14) continue;
    const bounds = new THREE.Box2().setFromPoints(points.map((p) => new THREE.Vector2(p.x, p.y)));
    yield { points, bounds, normal };
  }
}

/** Small spatial bins bound candidate work for finely tessellated selected surfaces. */
class PatchIndex {
  private readonly bounds = new THREE.Box2();
  private readonly cells = new Map<number, Patch[]>();
  private readonly count: number;

  constructor(patches: Patch[]) {
    this.count = Math.min(32, Math.max(1, Math.ceil(Math.sqrt(patches.length))));
    for (const patch of patches) this.bounds.union(patch.bounds);
    for (const patch of patches)
      for (const cell of this.range(patch.bounds)) {
        const entries = this.cells.get(cell) ?? [];
        entries.push(patch);
        this.cells.set(cell, entries);
      }
  }

  query(bounds: THREE.Box2): Patch[] {
    if (!this.bounds.intersectsBox(bounds)) return [];
    const found = new Set<Patch>();
    for (const cell of this.range(bounds))
      for (const patch of this.cells.get(cell) ?? [])
        if (patch.bounds.intersectsBox(bounds)) found.add(patch);
    return [...found];
  }

  private *range(bounds: THREE.Box2) {
    const cell = (value: number, low: number, high: number) =>
      Math.max(
        0,
        Math.min(this.count - 1, Math.floor(((value - low) / (high - low || 1)) * this.count)),
      );
    const x0 = cell(bounds.min.x, this.bounds.min.x, this.bounds.max.x);
    const x1 = cell(bounds.max.x, this.bounds.min.x, this.bounds.max.x);
    const y0 = cell(bounds.min.y, this.bounds.min.y, this.bounds.max.y);
    const y1 = cell(bounds.max.y, this.bounds.min.y, this.bounds.max.y);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) yield y * this.count + x;
  }
}

function blocks(source: Patch, target: Patch, tolerance: number): boolean {
  let polygon = source.points;
  const sign = Math.sign(target.normal.z);
  for (let i = 0; i < 3 && polygon.length; i++) {
    const a = target.points[i],
      b = target.points[(i + 1) % 3];
    const distance = (p: THREE.Vector3) =>
      sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const next: THREE.Vector3[] = [];
    for (let j = 0; j < polygon.length; j++) {
      const p = polygon[j],
        q = polygon[(j + 1) % polygon.length];
      const d = distance(p),
        e = distance(q);
      if (d >= 0) next.push(p);
      if (d >= 0 !== e >= 0) next.push(p.clone().lerp(q, d / (d - e)));
    }
    polygon = next;
  }
  if (polygon.length < 3) return false;
  // Shared edges are not occlusion; require a nonzero projected overlap area.
  let area = 0;
  for (let i = 1; i + 1 < polygon.length; i++)
    area += Math.abs(
      (polygon[i].x - polygon[0].x) * (polygon[i + 1].y - polygon[0].y) -
        (polygon[i].y - polygon[0].y) * (polygon[i + 1].x - polygon[0].x),
    );
  if (area < 1e-14) return false;
  const origin = target.points[0],
    normal = target.normal;
  return polygon.some((p) => {
    const depth = origin.z - (normal.x * (p.x - origin.x) + normal.y * (p.y - origin.y)) / normal.z;
    return p.z < depth - tolerance;
  });
}
