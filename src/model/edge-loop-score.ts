import type { Vector } from "../sketch/planes.js";
import type { Edge } from "./body.js";

/** Arc-length integrals: tessellation density must not bias the regression. */
export interface LoopMoments {
  length: number;
  first: number[];
  second: number[][];
}
export const emptyMoments = (): LoopMoments => ({
  length: 0,
  first: [0, 0, 0],
  second: Array.from({ length: 3 }, () => [0, 0, 0]),
});

export function edgeMoments(edge: Edge, origin: Vector): LoopMoments {
  const result = emptyMoments();
  for (let i = 3; i < edge.points.length; i += 3) {
    const a = origin.map((v, k) => edge.points[i - 3 + k] - v);
    const b = origin.map((v, k) => edge.points[i + k] - v);
    const length = Math.hypot(...a.map((v, k) => b[k] - v));
    result.length += length;
    for (let row = 0; row < 3; row++) {
      result.first[row] += (length * (a[row] + b[row])) / 2;
      for (let col = 0; col < 3; col++)
        result.second[row][col] +=
          (length *
            (2 * a[row] * a[col] + a[row] * b[col] + b[row] * a[col] + 2 * b[row] * b[col])) /
          6;
    }
  }
  return result;
}

export function addMoments(a: LoopMoments, b: LoopMoments): LoopMoments {
  return {
    length: a.length + b.length,
    first: a.first.map((v, i) => v + b.first[i]),
    second: a.second.map((row, i) => row.map((v, j) => v + b.second[i][j])),
  };
}

/** Eigenvalues of the arc-length scatter matrix, from narrowest to longest axis. */
export function loopScatter(moments: LoopMoments): number[] {
  if (!moments.length) return [0, 0, 0];
  const m = moments.second.map((row, i) =>
    row.map((v, j) => v - (moments.first[i] * moments.first[j]) / moments.length),
  );
  // Jacobi diagonalization of the symmetric 3x3 scatter matrix.
  for (let iteration = 0; iteration < 24; iteration++) {
    let p = 0,
      q = 1;
    for (const [a, b] of [
      [0, 2],
      [1, 2],
    ])
      if (Math.abs(m[a][b]) > Math.abs(m[p][q])) [p, q] = [a, b];
    if (Math.abs(m[p][q]) <= Math.max(...m.map((row, i) => Math.abs(row[i])), 1e-30) * 1e-12) break;
    const angle = 0.5 * Math.atan2(2 * m[p][q], m[q][q] - m[p][p]);
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const pp = m[p][p],
      qq = m[q][q],
      pq = m[p][q];
    m[p][p] = c * c * pp - 2 * s * c * pq + s * s * qq;
    m[q][q] = s * s * pp + 2 * s * c * pq + c * c * qq;
    m[p][q] = m[q][p] = 0;
    for (let k = 0; k < 3; k++) {
      if (k === p || k === q) continue;
      const kp = m[k][p],
        kq = m[k][q];
      m[k][p] = m[p][k] = c * kp - s * kq;
      m[k][q] = m[q][k] = s * kp + c * kq;
    }
  }
  return [m[0][0], m[1][1], m[2][2]].map((v) => Math.max(0, v)).sort((a, b) => a - b);
}

/** Integral of squared orthogonal distance to the least-squares plane. */
export function planeError(moments: LoopMoments): number {
  return loopScatter(moments)[0];
}

// Compare thickness to in-plane width, not the length of a long selected edge.
// A 1% thickness/width ratio costs 0.04; logarithmic length leaves small bends usable.
export const loopPlanarityWeight = 400;
export function loopScore(moments: LoopMoments, seedLength: number): number {
  const [thickness, width] = loopScatter(moments);
  return (
    Math.log1p(moments.length / seedLength) +
    loopPlanarityWeight * (width > 0 ? thickness / width : 0)
  );
}

/** Every completion adds a positive-semidefinite scatter increment. Its middle
 * eigenvalue is at most the entire graph's; using that fixed upper bound keeps
 * pruning valid even when the completed loop is much wider than a partial path. */
export function loopScoreBound(
  moments: LoopMoments,
  remaining: number,
  seedLength: number,
  maximumWidth: number,
): number {
  return (
    Math.log1p((moments.length + remaining) / seedLength) +
    loopPlanarityWeight * (maximumWidth > 0 ? planeError(moments) / maximumWidth : 0)
  );
}
