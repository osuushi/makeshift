import * as THREE from "three";
import type { ProjectionBounds } from "./normal-projection-bounds.js";
import type { NormalChart } from "./normal-projection-charts.js";
import type { PackedPreviewMesh } from "./preview-wire.js";

/** Project triangle footprints first, then intersect only covered normal lines.
 * This keeps exact ray/triangle intersections without a BVH traversal at every texel. */
export function rasterNormalProjection(mesh: PackedPreviewMesh, chart: NormalChart): Uint8Array {
  const count = chart.size * chart.size;
  const positions = new Float64Array(count * 3),
    supports = new Float64Array(count * 3);
  const normals = new Uint8Array(count * 4);
  const distances = new Float64Array(count).fill(Infinity);
  const point = new THREE.Vector3(),
    normal = new THREE.Vector3();
  for (let y = 0; y < chart.size; y++)
    for (let x = 0; x < chart.size; x++) {
      const i = y * chart.size + x;
      chart.sample((x + 0.5) / chart.size, (y + 0.5) / chart.size, point, normal);
      positions.set(point.toArray(), i * 3);
      supports.set(normal.toArray(), i * 3);
      writeNormal(normals, i, normal);
    }
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    a.fromArray(mesh.positions, mesh.indices[i] * 3);
    b.fromArray(mesh.positions, mesh.indices[i + 1] * 3);
    c.fromArray(mesh.positions, mesh.indices[i + 2] * 3);
    const bounds = chart.bounds?.([a, b, c]);
    if (bounds)
      rasterTriangle(a, b, c, bounds, chart.size, positions, supports, normals, distances);
  }
  return normals;
}

function writeNormal(pixels: Uint8Array, i: number, normal: THREE.Vector3): void {
  pixels[i * 4] = Math.round((normal.x * 0.5 + 0.5) * 255);
  pixels[i * 4 + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
  pixels[i * 4 + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
  pixels[i * 4 + 3] = 255;
}

function rasterTriangle(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  bounds: ProjectionBounds,
  size: number,
  positions: Float64Array,
  supports: Float64Array,
  pixels: Uint8Array,
  distances: Float64Array,
): void {
  const ab = b.clone().sub(a),
    ac = c.clone().sub(a);
  const normal = ab.clone().cross(ac).normalize();
  const aa = ab.dot(ab),
    bb = ac.dot(ac),
    cross = ab.dot(ac);
  const determinant = aa * bb - cross * cross;
  if (determinant <= 0) return;
  const left = bounds.wrap
    ? Math.floor(bounds.left * size - 0.5)
    : Math.max(0, Math.floor(bounds.left * size - 0.5));
  const right = bounds.wrap
    ? Math.ceil(bounds.right * size - 0.5)
    : Math.min(size - 1, Math.ceil(bounds.right * size - 0.5));
  const bottom = Math.max(0, Math.floor(bounds.bottom * size - 0.5));
  const top = Math.min(size - 1, Math.ceil(bounds.top * size - 0.5));
  for (let y = bottom; y <= top; y++)
    for (let x = left; x <= right; x++) {
      const i = y * size + (((x % size) + size) % size),
        offset = i * 3;
      const nx = supports[offset],
        ny = supports[offset + 1],
        nz = supports[offset + 2];
      const facing = normal.x * nx + normal.y * ny + normal.z * nz;
      if (facing <= 0.01) continue;
      const dx = a.x - positions[offset],
        dy = a.y - positions[offset + 1],
        dz = a.z - positions[offset + 2];
      const t = (normal.x * dx + normal.y * dy + normal.z * dz) / facing;
      if (Math.abs(t) >= distances[i]) continue;
      const hx = t * nx - dx,
        hy = t * ny - dy,
        hz = t * nz - dz;
      const dotAB = hx * ab.x + hy * ab.y + hz * ab.z;
      const dotAC = hx * ac.x + hy * ac.y + hz * ac.z;
      const s = (bb * dotAB - cross * dotAC) / determinant;
      const v = (aa * dotAC - cross * dotAB) / determinant;
      if (s < -1e-8 || v < -1e-8 || s + v > 1 + 1e-8) continue;
      distances[i] = Math.abs(t);
      writeNormal(pixels, i, normal);
    }
}
