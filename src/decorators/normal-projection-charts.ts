import * as THREE from "three";
import type { Face } from "../model/body.js";

export interface NormalChart {
  uv: Float32Array;
  size: number;
  sample(x: number, y: number, point: THREE.Vector3, normal: THREE.Vector3): void;
}
const vector = (values: readonly number[]) => new THREE.Vector3(...values);

/** Analytic charts keep long thin tessellation triangles from wasting texture resolution. */
export function normalChart(face: Face, size: number): NormalChart {
  if (face.cylinder || face.cone) return radialChart(face, size);
  if (face.plane) return planarChart(face, size);
  return triangleChart(face, size);
}

function planarChart(face: Face, size: number): NormalChart {
  const frame = face.plane;
  if (!frame) throw new Error("Missing projection plane");
  const origin = vector(frame.origin),
    u = vector(frame.u),
    v = vector(frame.v);
  const normal = u.clone().cross(v).normalize();
  const point = new THREE.Vector3();
  const bounds = new THREE.Box2();
  const coordinates: THREE.Vector2[] = [];
  for (let i = 0; i < face.vertices.length; i += 3) {
    point.fromArray(face.vertices, i).sub(origin);
    const coordinate = new THREE.Vector2(point.dot(u), point.dot(v));
    coordinates.push(coordinate);
    bounds.expandByPoint(coordinate);
  }
  const extent = bounds.getSize(new THREE.Vector2());
  extent.x = Math.max(extent.x, 1e-9);
  extent.y = Math.max(extent.y, 1e-9);
  return {
    size,
    uv: new Float32Array(
      coordinates.flatMap((p) => [
        (p.x - bounds.min.x) / extent.x,
        (p.y - bounds.min.y) / extent.y,
      ]),
    ),
    sample(x, y, point, targetNormal) {
      point
        .copy(origin)
        .addScaledVector(u, bounds.min.x + x * extent.x)
        .addScaledVector(v, bounds.min.y + y * extent.y);
      targetNormal.copy(normal);
    },
  };
}

function radialChart(face: Face, size: number): NormalChart {
  const surface = face.cylinder ?? face.cone;
  if (!surface) throw new Error("Missing radial projection surface");
  const origin = vector(face.cylinder?.origin ?? face.cone?.apex ?? [0, 0, 0]);
  const axis = vector(surface.axis).normalize();
  const u = new THREE.Vector3(Math.abs(axis.x) < 0.8 ? 1 : 0, Math.abs(axis.x) < 0.8 ? 0 : 1, 0)
    .addScaledVector(axis, -(Math.abs(axis.x) < 0.8 ? axis.x : axis.y))
    .normalize();
  const v = axis.clone().cross(u);
  const delta = new THREE.Vector3();
  let low = Infinity,
    high = -Infinity;
  const uv = new Float32Array((face.vertices.length / 3) * 2);
  for (let i = 0; i < face.vertices.length / 3; i++) {
    delta.fromArray(face.vertices, i * 3).sub(origin);
    const z = delta.dot(axis);
    low = Math.min(low, z);
    high = Math.max(high, z);
    uv[i * 2] = Math.atan2(delta.dot(v), delta.dot(u)) / (2 * Math.PI) + 0.5;
    uv[i * 2 + 1] = z;
  }
  const height = Math.max(high - low, 1e-9);
  for (let i = 1; i < uv.length; i += 2) uv[i] = (uv[i] - low) / height;
  // Duplicate seam coordinates per triangle; sampling wraps, interpolation never crosses the map.
  for (let i = 0; i < uv.length; i += 6) {
    const angles = [uv[i], uv[i + 2], uv[i + 4]];
    if (Math.max(...angles) - Math.min(...angles) > 0.5)
      for (const j of [i, i + 2, i + 4]) if (uv[j] < 0.5) uv[j] += 1;
  }
  const slope = face.cone ? Math.tan(face.cone.semiAngle) : 0;
  return {
    uv,
    size,
    sample(x, y, point, normal) {
      const angle = (x - 0.5) * Math.PI * 2;
      const z = low + y * height;
      normal.copy(u).multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle));
      point
        .copy(origin)
        .addScaledVector(axis, z)
        .addScaledVector(normal, face.cylinder?.radius ?? z * slope);
      normal.addScaledVector(axis, -slope).normalize().multiplyScalar(surface.outward);
    },
  };
}

/** Arbitrary custom supports use a padded per-triangle atlas, preserving trimmed boundaries. */
function triangleChart(face: Face, size: number): NormalChart {
  const count = face.vertices.length / 9;
  const columns = Math.ceil(Math.sqrt(count));
  const cell = Math.max(4, Math.floor(size / columns));
  size = cell * columns;
  const uv = new Float32Array(count * 6);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const x = (i % columns) * cell + 1.5,
      y = Math.floor(i / columns) * cell + 1.5;
    uv.set(
      [x / size, y / size, (x + cell - 3) / size, y / size, x / size, (y + cell - 3) / size],
      i * 6,
    );
  }
  return {
    uv,
    size,
    sample(x, y, point, normal) {
      const px = x * size,
        py = y * size;
      const col = Math.min(columns - 1, Math.floor(px / cell));
      const row = Math.min(columns - 1, Math.floor(py / cell));
      const i = Math.min(count - 1, row * columns + col);
      let s = Math.max(0, (px - col * cell - 1.5) / (cell - 3));
      let t = Math.max(0, (py - row * cell - 1.5) / (cell - 3));
      if (s + t > 1) {
        const sum = s + t;
        s /= sum;
        t /= sum;
      }
      a.fromArray(face.vertices, i * 9);
      b.fromArray(face.vertices, i * 9 + 3).sub(a);
      c.fromArray(face.vertices, i * 9 + 6).sub(a);
      point.copy(a).addScaledVector(b, s).addScaledVector(c, t);
      normal.copy(b).cross(c).normalize();
    },
  };
}
