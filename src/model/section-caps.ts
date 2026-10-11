import * as THREE from "three";
import type { PlaneFrame } from "../sketch/planes.js";
import { stableClipping } from "../sketch/stable-clipping.js";
import type { World } from "../sketch/world.js";
import { sectionMaterial } from "./section-pattern.js";

const capBit = 8;

/** Per-body parity of the clipped closed shell fills material, including real cavities.
 * Uses only bit 8; sketch union, solid silhouette and coplanar face bits stay intact.
 * Displayed geometry includes live candidates; no async exact-shape query or stale cap. */
export class SectionCaps {
  private readonly scene = new THREE.Scene();
  private readonly resetScene = new THREE.Scene();
  private readonly resetCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly reset = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      stencilWrite: true,
      stencilRef: 0,
      stencilWriteMask: capBit,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
    }),
  );
  private readonly parity = stableClipping(
    new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      stencilWrite: true,
      stencilWriteMask: capBit,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.InvertStencilOp,
    }),
  );
  private readonly plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial(),
  );
  private readonly styles = new Map<string, THREE.MeshBasicMaterial>();

  constructor() {
    this.resetScene.add(this.reset);
    this.plane.frustumCulled = false;
    this.plane.material.dispose();
  }

  render(world: World): void {
    const frame = world.partialSection ?? world.crossSection;
    if (!frame) return;
    const bodies = new Map<string, THREE.Mesh[]>();
    const seeds = new Map<string, string>();
    const hovered = new Set<string>();
    world.scene.traverseVisible((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.userData.sectionBody) hovered.add(object.userData.sectionBody);
      const body: string | undefined = object.userData.bodyFace?.body;
      if (!body) return;
      for (let owner: THREE.Object3D | null = object; owner; owner = owner.parent)
        if (owner.userData.sectionStyleKey) seeds.set(body, owner.userData.sectionStyleKey);
      const faces = bodies.get(body) ?? [];
      faces.push(object);
      bodies.set(body, faces);
    });
    for (const [id, material] of this.styles) {
      if (bodies.has(id)) continue;
      material.dispose();
      this.styles.delete(id);
    }
    const { renderer, camera } = world;
    const clipping = renderer.clippingPlanes;
    const autoClear = renderer.autoClear;
    const clip = clipping[0]?.clone();
    if (!clip) return;
    clip.constant -= 1e-4;
    renderer.autoClear = false;
    try {
      for (const [body, faces] of bodies) {
        renderer.clippingPlanes = [];
        renderer.render(this.resetScene, this.resetCamera);
        this.scene.clear();
        for (const face of faces) {
          const shell = new THREE.Mesh(face.geometry, this.parity);
          shell.matrixAutoUpdate = false;
          shell.matrix.copy(face.matrixWorld);
          shell.frustumCulled = false;
          this.scene.add(shell);
        }
        renderer.clippingPlanes = [clip];
        renderer.render(this.scene, camera);
        let material = this.styles.get(body);
        const seed = seeds.get(body) ?? body;
        if (material && material.userData.sectionStyleKey !== seed) {
          material.dispose();
          material = undefined;
        }
        if (!material) {
          material = sectionMaterial(seed);
          material.userData.sectionStyleKey = seed;
          this.styles.set(body, material);
        }
        material.color.set(hovered.has(body) ? "#ffe5b7" : "#ffffff");
        this.plane.material = material;
        this.position(frame, faces);
        this.scene.clear();
        this.scene.add(this.plane);
        renderer.clippingPlanes = [];
        renderer.render(this.scene, camera);
      }
      renderer.render(this.resetScene, this.resetCamera);
    } finally {
      renderer.clippingPlanes = clipping;
      renderer.autoClear = autoClear;
      this.scene.clear();
    }
  }

  private position(frame: PlaneFrame, faces: THREE.Mesh[]): void {
    const u = new THREE.Vector3(...frame.u),
      v = new THREE.Vector3(...frame.v);
    const origin = new THREE.Vector3(...frame.origin);
    const box = new THREE.Box3();
    for (const face of faces) box.expandByObject(face);
    const min = new THREE.Vector2(Infinity, Infinity);
    const max = new THREE.Vector2(-Infinity, -Infinity);
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const relative = new THREE.Vector3(x, y, z).sub(origin);
          const point = new THREE.Vector2(relative.dot(u), relative.dot(v));
          min.min(point);
          max.max(point);
        }
    // Geometry stays in plane coordinates so pattern size/phase never depend on bounds.
    const positions = this.plane.geometry.getAttribute("position");
    for (let i = 0; i < 4; i++)
      positions.setXY(i, i % 2 ? max.x + 0.01 : min.x - 0.01, i < 2 ? max.y + 0.01 : min.y - 0.01);
    positions.needsUpdate = true;
    this.plane.position.copy(origin);
    this.plane.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(u, v, u.clone().cross(v)),
    );
  }

  dispose(): void {
    this.reset.geometry.dispose();
    this.reset.material.dispose();
    this.parity.dispose();
    this.plane.geometry.dispose();
    for (const material of this.styles.values()) material.dispose();
    this.styles.clear();
  }
}
