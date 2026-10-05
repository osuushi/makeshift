import * as THREE from "three";

export type CubeSurface = {
  name: string;
  kind: "face" | "edge" | "corner";
  normal: THREE.Vector3;
  up: THREE.Vector3;
  vertices: THREE.Vector3[];
};
// Wider bevels share the same visible polygons and pointer/touch targets.
const inset = 0.58;
const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const names = [
  ["Left", "Right"],
  ["Front", "Back"],
  ["Bottom", "Top"],
];
const signs = [-1, 1];
const label = (axis: number, sign: number) => names[axis][sign > 0 ? 1 : 0];

/** Six inset faces, twelve edge strips and eight corner triangles share exact vertices. */
export function cubeSurfaces(): CubeSurface[] {
  const surfaces: CubeSurface[] = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of signs) {
      const normal = axes[axis].clone().multiplyScalar(sign);
      const up = axis === 2 ? new THREE.Vector3(0, sign, 0) : axes[2].clone();
      const right = up.clone().cross(normal);
      const vertices = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([x, y]) =>
        normal
          .clone()
          .addScaledVector(right, x * inset)
          .addScaledVector(up, y * inset),
      );
      surfaces.push({ name: label(axis, sign), kind: "face", normal, up, vertices });
    }
  }
  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 3; b++) {
      const along = axes[3 - a - b];
      for (const sa of signs) {
        for (const sb of signs) {
          const first = axes[a].clone().multiplyScalar(sa);
          const second = axes[b].clone().multiplyScalar(sb);
          const p = first.clone().addScaledVector(second, inset);
          const q = second.clone().addScaledVector(first, inset);
          surfaces.push({
            name: `${label(a, sa)} ${label(b, sb)}`,
            kind: "edge",
            normal: first.add(second).normalize(),
            up: axes[2].clone(),
            vertices: [
              p.clone().addScaledVector(along, -inset),
              q.clone().addScaledVector(along, -inset),
              q.clone().addScaledVector(along, inset),
              p.clone().addScaledVector(along, inset),
            ],
          });
        }
      }
    }
  }
  for (const x of signs) {
    for (const y of signs) {
      for (const z of signs) {
        surfaces.push({
          name: `${label(0, x)} ${label(1, y)} ${label(2, z)}`,
          kind: "corner",
          normal: new THREE.Vector3(x, y, z).normalize(),
          up: axes[2].clone(),
          vertices: [
            new THREE.Vector3(x, y * inset, z * inset),
            new THREE.Vector3(x * inset, y, z * inset),
            new THREE.Vector3(x * inset, y * inset, z),
          ],
        });
      }
    }
  }
  return surfaces;
}
