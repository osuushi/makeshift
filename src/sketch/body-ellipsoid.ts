import * as THREE from "three";

export type BodyMaskGeometry = readonly (readonly number[])[];
export interface BodyEllipsoid {
  center: THREE.Vector3;
  /** Oriented semi-axis vectors, including their lengths. */
  axes: THREE.Vector3[];
}
const fits = new WeakMap<BodyMaskGeometry, BodyEllipsoid | null>();

/** Immutable drawable geometry owns the fit; camera and appearance never invalidate it. */
export function bodyEllipsoid(geometry: BodyMaskGeometry): BodyEllipsoid | null {
  if (fits.has(geometry)) return fits.get(geometry) ?? null;
  const fit = fitEllipsoid(geometry);
  fits.set(geometry, fit);
  return fit;
}

function fitEllipsoid(geometry: BodyMaskGeometry): BodyEllipsoid | null {
  const mean = new THREE.Vector3();
  let count = 0;
  for (const face of geometry)
    for (let i = 0; i < face.length; i += 3) {
      mean.x += face[i];
      mean.y += face[i + 1];
      mean.z += face[i + 2];
      count++;
    }
  if (!count) return null;
  mean.divideScalar(count);
  const covariance = Array.from({ length: 3 }, () => [0, 0, 0]);
  const point = new THREE.Vector3();
  for (const face of geometry)
    for (let i = 0; i < face.length; i += 3) {
      point.fromArray(face, i).sub(mean);
      const v = [point.x, point.y, point.z];
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 3; col++) covariance[row][col] += (v[row] * v[col]) / count;
    }
  const axes = principalAxes(covariance);
  const low = [Infinity, Infinity, Infinity],
    high = [-Infinity, -Infinity, -Infinity];
  for (const face of geometry)
    for (let i = 0; i < face.length; i += 3) {
      point.fromArray(face, i).sub(mean);
      for (let axis = 0; axis < 3; axis++) {
        const value = point.dot(axes[axis]);
        low[axis] = Math.min(low[axis], value);
        high[axis] = Math.max(high[axis], value);
      }
    }
  const center = mean.clone();
  const radii = high.map((value, i) => (value - low[i]) / 2);
  const floor = Math.max(...radii, 1) * 1e-7;
  for (let i = 0; i < 3; i++) {
    center.addScaledVector(axes[i], (low[i] + high[i]) / 2);
    radii[i] = Math.max(radii[i], floor);
  }
  // Inflate until every vertex is inside. Convexity then contains every triangle,
  // including sparse boxes. This is conservative, not a minimum-volume fit.
  let squaredScale = 1;
  for (const face of geometry)
    for (let i = 0; i < face.length; i += 3) {
      point.fromArray(face, i).sub(center);
      let radius = 0;
      for (let axis = 0; axis < 3; axis++) radius += (point.dot(axes[axis]) / radii[axis]) ** 2;
      squaredScale = Math.max(squaredScale, radius);
    }
  const scale = Math.sqrt(squaredScale) * (1 + 1e-6);
  return { center, axes: axes.map((axis, i) => axis.multiplyScalar(radii[i] * scale)) };
}

/** Jacobi rotations diagonalize a symmetric 3x3 covariance, including repeated eigenvalues. */
function principalAxes(matrix: number[][]): THREE.Vector3[] {
  const vectors = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let iteration = 0; iteration < 24; iteration++) {
    let p = 0,
      q = 1;
    for (const [a, b] of [
      [0, 2],
      [1, 2],
    ])
      if (Math.abs(matrix[a][b]) > Math.abs(matrix[p][q])) [p, q] = [a, b];
    const magnitude = Math.max(...matrix.map((row, i) => Math.abs(row[i])), 1e-30);
    if (Math.abs(matrix[p][q]) < magnitude * 1e-12) break;
    const angle = 0.5 * Math.atan2(2 * matrix[p][q], matrix[q][q] - matrix[p][p]);
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const pp = matrix[p][p],
      qq = matrix[q][q],
      pq = matrix[p][q];
    matrix[p][p] = c * c * pp - 2 * s * c * pq + s * s * qq;
    matrix[q][q] = s * s * pp + 2 * s * c * pq + c * c * qq;
    matrix[p][q] = matrix[q][p] = 0;
    for (let k = 0; k < 3; k++) {
      if (k !== p && k !== q) {
        const kp = matrix[k][p],
          kq = matrix[k][q];
        matrix[k][p] = matrix[p][k] = c * kp - s * kq;
        matrix[k][q] = matrix[q][k] = s * kp + c * kq;
      }
      const vp = vectors[k][p],
        vq = vectors[k][q];
      vectors[k][p] = c * vp - s * vq;
      vectors[k][q] = s * vp + c * vq;
    }
  }
  return [0, 1, 2].map((i) => new THREE.Vector3(vectors[0][i], vectors[1][i], vectors[2][i]));
}

export interface BodyEllipse {
  center: THREE.Vector2;
  radii: THREE.Vector2;
  direction: THREE.Vector2;
}

/** Orthographic projection of the ellipsoid's shape matrix, in CSS pixels. */
export function projectBodyEllipsoid(
  fit: BodyEllipsoid,
  transform: THREE.Matrix4,
  width: number,
  height: number,
): BodyEllipse {
  const center = fit.center.clone().applyMatrix4(transform);
  const linear = new THREE.Matrix3().setFromMatrix4(transform);
  let xx = 0,
    xy = 0,
    yy = 0;
  for (const axis of fit.axes) {
    const projected = axis.clone().applyMatrix3(linear);
    const x = (projected.x * width) / 2,
      y = (projected.y * height) / 2;
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  const discriminant = Math.hypot(xx - yy, 2 * xy);
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  return {
    center: new THREE.Vector2(((center.x + 1) * width) / 2, ((center.y + 1) * height) / 2),
    radii: new THREE.Vector2(
      Math.sqrt(Math.max(0, (xx + yy + discriminant) / 2)),
      Math.sqrt(Math.max(0, (xx + yy - discriminant) / 2)),
    ),
    direction: new THREE.Vector2(Math.cos(angle), Math.sin(angle)),
  };
}
