import type { PlaneFrame, Vector } from "../sketch/planes.js";

/** Three row-major rows of a homogeneous transform, in millimeters. */
export type Affine = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const identityAffine: Affine = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const rows = [0, 4, 8];
const axes = [0, 1, 2];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const scale = (v: Vector, factor: number): Vector => [v[0] * factor, v[1] * factor, v[2] * factor];
const column = (m: Affine, i: number): Vector => [m[i], m[i + 4], m[i + 8]];

export function affineVector(m: Affine, v: Vector): Vector {
  return rows.map((i) => m[i] * v[0] + m[i + 1] * v[1] + m[i + 2] * v[2]) as Vector;
}

export function affinePoint(m: Affine, p: Vector): Vector {
  return affineVector(m, p).map((x, i) => x + m[4 * i + 3]) as Vector;
}

export function composeAffine(a: Affine, b: Affine): Affine {
  const columns = axes.map((i) => affineVector(a, column(b, i)));
  const offset = affinePoint(a, column(b, 3));
  return axes.flatMap((i) => [
    columns[0][i],
    columns[1][i],
    columns[2][i],
    offset[i],
  ]) as unknown as Affine;
}

export function inverseAffine(m: Affine): Affine {
  const x = column(m, 0),
    y = column(m, 1),
    z = column(m, 2);
  const determinant = dot(x, cross(y, z));
  const offset = column(m, 3);
  return [cross(y, z), cross(z, x), cross(x, y)].flatMap((cofactors) => {
    const row = scale(cofactors, 1 / determinant);
    return [...row, -dot(row, offset)];
  }) as unknown as Affine;
}

export function requireAffine(value: unknown): asserts value is Affine {
  if (
    !Array.isArray(value) ||
    value.length !== 12 ||
    !Array.from(value).every((v) => typeof v === "number" && Number.isFinite(v))
  )
    throw new Error("Enter twelve finite affine transform values");
  const matrix = value as unknown as Affine;
  const x = column(matrix, 0),
    y = column(matrix, 1),
    z = column(matrix, 2);
  const lengths = Math.hypot(...x) * Math.hypot(...y) * Math.hypot(...z);
  if (
    !Number.isFinite(lengths) ||
    Math.abs(dot(x, cross(y, z))) <= lengths * 1e-12 ||
    !inverseAffine(matrix).every(Number.isFinite)
  )
    throw new Error("The transform must preserve three independent axes");
}

/** Keep authoring planes orthonormal and encode the remaining affine map in sketch coordinates. */
export function affineFrame(frame: PlaneFrame, matrix: Affine) {
  const uVector = affineVector(matrix, frame.u);
  const vVector = affineVector(matrix, frame.v);
  const x = Math.hypot(...uVector);
  const u = scale(uVector, 1 / x);
  const shear = dot(vVector, u);
  const remainder = vVector.map((value, i) => value - shear * u[i]) as Vector;
  const y = Math.hypot(...remainder);
  return {
    plane: { origin: affinePoint(matrix, frame.origin), u, v: scale(remainder, 1 / y) },
    x,
    y,
    shear,
    map: (p: { x: number; y: number }) => ({ x: x * p.x + shear * p.y, y: y * p.y }),
  };
}
