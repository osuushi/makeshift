import * as THREE from "three";

export interface ProjectionBounds {
  left: number;
  right: number;
  bottom: number;
  top: number;
  wrap?: boolean;
}

/** A radial triangle subtends a continuous angular interval unless it surrounds the axis. */
export function radialProjectionBounds(
  points: readonly THREE.Vector3[],
  origin: THREE.Vector3,
  axis: THREE.Vector3,
  u: THREE.Vector3,
  v: THREE.Vector3,
  low: number,
  height: number,
  slope: number,
): ProjectionBounds {
  const delta = new THREE.Vector3();
  const coordinates = points.map((point) => {
    delta.copy(point).sub(origin);
    return { x: delta.dot(u), y: delta.dot(v), z: delta.dot(axis) };
  });
  const angles = coordinates.map(({ x, y }) => Math.atan2(y, x) / (2 * Math.PI) + 0.5);
  for (let i = 1; i < angles.length; i++) angles[i] += Math.round(angles[0] - angles[i]);
  let left = Math.min(...angles),
    right = Math.max(...angles);
  if (right - left > 0.5) {
    left = 0;
    right = 1;
  }
  let bottom = Math.min(...coordinates.map(({ z }) => z));
  let top = Math.max(...coordinates.map(({ z }) => z));
  if (slope) {
    // Cone-normal projection has axial coordinate (z + slope * radius) / (1 + slope²).
    // A radial AABB bounds radius over the entire triangle, including its curved UV edges.
    const radial = new THREE.Box2().setFromPoints(
      coordinates.map(({ x, y }) => new THREE.Vector2(x, y)),
    );
    const minimumRadius = radial.distanceToPoint(new THREE.Vector2());
    const maximumRadius = Math.max(...coordinates.map(({ x, y }) => Math.hypot(x, y)));
    bottom = (bottom + slope * minimumRadius) / (1 + slope * slope);
    top = (top + slope * maximumRadius) / (1 + slope * slope);
  }
  return { left, right, bottom: (bottom - low) / height, top: (top - low) / height, wrap: true };
}
