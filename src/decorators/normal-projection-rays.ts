import * as THREE from "three";
import type { PackedPreviewMesh } from "./preview-wire.js";

interface Facet {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  normal: THREE.Vector3;
  center: THREE.Vector3;
  bounds: THREE.Box3;
}
interface Branch {
  bounds: THREE.Box3;
  facets?: Facet[];
  children?: [Branch, Branch];
}

function branch(facets: Facet[]): Branch {
  const bounds = new THREE.Box3();
  for (const facet of facets) bounds.union(facet.bounds);
  if (facets.length <= 8) return { bounds, facets };
  const size = bounds.getSize(new THREE.Vector3());
  const axis = size.x >= size.y && size.x >= size.z ? "x" : size.y >= size.z ? "y" : "z";
  facets.sort((a, b) => a.center[axis] - b.center[axis]);
  const middle = Math.floor(facets.length / 2);
  return { bounds, children: [branch(facets.slice(0, middle)), branch(facets.slice(middle))] };
}

/** Worker-only acceleration for projecting arbitrary generated meshes along support normals. */
export class NormalProjectionRays {
  private readonly root: Branch;
  private readonly ray = new THREE.Ray();
  private readonly hit = new THREE.Vector3();
  private readonly boxHit = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly result = new THREE.Vector3();

  constructor(mesh: PackedPreviewMesh) {
    const facets: Facet[] = [];
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a, b, c] = [0, 1, 2].map((corner) =>
        new THREE.Vector3().fromArray(mesh.positions, mesh.indices[i + corner] * 3),
      );
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (!normal.lengthSq()) continue;
      facets.push({
        a,
        b,
        c,
        normal,
        center: a
          .clone()
          .add(b)
          .add(c)
          .multiplyScalar(1 / 3),
        bounds: new THREE.Box3().setFromPoints([a, b, c]),
      });
    }
    this.root = branch(facets);
  }

  /** Closest facing surface in either direction; opposing walls cannot bleed through. */
  normal(point: THREE.Vector3, support: THREE.Vector3): THREE.Vector3 {
    let distance = Infinity;
    this.result.copy(support);
    for (const sign of [1, -1]) {
      this.direction.copy(support).multiplyScalar(sign);
      this.ray.set(point, this.direction);
      const visit = (node: Branch) => {
        if (!this.ray.intersectBox(node.bounds, this.boxHit)) return;
        if (!node.bounds.containsPoint(point) && point.distanceToSquared(this.boxHit) > distance)
          return;
        if (node.children) {
          visit(node.children[0]);
          visit(node.children[1]);
        }
        for (const facet of node.facets ?? []) {
          if (facet.normal.dot(support) <= 0.01) continue;
          if (!this.ray.intersectTriangle(facet.a, facet.b, facet.c, false, this.hit)) continue;
          const next = point.distanceToSquared(this.hit);
          if (next >= distance) continue;
          distance = next;
          this.result.copy(facet.normal);
        }
      };
      visit(this.root);
    }
    return this.result;
  }
}
