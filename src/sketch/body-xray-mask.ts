import * as THREE from "three";
import { ScreenDilation } from "./screen-dilation.js";
import type { World } from "./world.js";
import type { XrayAperture } from "./xray-composite.js";

/** Reuse body meshes for the silhouette; dilation cost depends on pixels, not triangles. */
export class BodyXrayMask implements XrayAperture {
  private readonly scene = new THREE.Scene();
  private readonly dilation = new ScreenDilation();
  private readonly drawings = new Map<THREE.Mesh, THREE.Mesh>();
  private key = "";
  private contents: object = {};

  constructor() {
    this.scene.background = new THREE.Color("black");
  }

  read(world: World): object {
    const sources: THREE.Mesh[] = [];
    world.scene.traverseVisible((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        !(object.userData.bodyFace || object.userData.bodyMask)
      )
        return;
      if (xrayOwner(object)) return;
      sources.push(object);
    });
    const key = `${sources.map((mesh) => `${mesh.uuid}:${mesh.geometry.uuid}:${mesh.matrixWorld.elements}`).join("|")}:${world.camera.matrixWorld.elements}:${world.camera.projectionMatrix.elements}:${world.canvas.clientWidth}:${world.canvas.clientHeight}`;
    if (key === this.key) return this.contents;
    this.key = key;
    this.contents = {};
    const visible = new Set(sources);
    for (const [source, drawing] of this.drawings) {
      if (visible.has(source) && source.geometry === drawing.geometry) continue;
      this.scene.remove(drawing);
      this.drawings.delete(source);
    }
    for (const source of sources) {
      let drawing = this.drawings.get(source);
      if (!drawing) {
        drawing = new THREE.Mesh(source.geometry, this.dilation.seed);
        drawing.matrixAutoUpdate = false;
        drawing.frustumCulled = false;
        this.drawings.set(source, drawing);
        this.scene.add(drawing);
      }
      drawing.matrix.copy(source.matrixWorld);
    }

    return this.contents;
  }

  render(world: World, target: THREE.WebGLRenderTarget, bleed: number): void {
    this.read(world);
    this.dilation.render(
      world.renderer,
      target,
      world.canvas.clientWidth,
      world.canvas.clientHeight,
      bleed,
      () => world.renderer.render(this.scene, world.camera),
    );
  }

  contains(): boolean {
    return true;
  }

  dispose(): void {
    this.drawings.clear();
    this.scene.clear();
    this.dilation.dispose();
  }
}

function xrayOwner(object: THREE.Object3D): boolean {
  for (let owner: THREE.Object3D | null = object; owner; owner = owner.parent)
    if (owner.userData.xrayBody) return true;
  return false;
}
