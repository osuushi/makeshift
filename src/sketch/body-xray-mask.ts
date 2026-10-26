import * as THREE from "three";
import { bodyEllipseMaterial } from "./body-ellipse-material.js";
import { type BodyMaskGeometry, bodyEllipsoid, projectBodyEllipsoid } from "./body-ellipsoid.js";
import type { World } from "./world.js";
import type { XrayAperture } from "./xray-composite.js";

/** Geometry fits are cached; each moving frame projects only three axes per body. */
export class BodyXrayMask implements XrayAperture {
  readonly feathered = true;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly material = bodyEllipseMaterial();
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private readonly mesh = new THREE.Mesh(this.geometry, this.material);
  private sources: { object: THREE.Object3D; geometry: BodyMaskGeometry }[] = [];
  private key = "";
  private contents: object = {};

  constructor() {
    this.scene.background = new THREE.Color("black");
    this.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3),
    );
    this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.geometry.instanceCount = 0;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  read(world: World): object {
    const sources: typeof this.sources = [];
    world.scene.traverseVisible((object) => {
      const geometry = object.userData.bodyMaskGeometry as BodyMaskGeometry | undefined;
      if (geometry && !xrayOwner(object)) sources.push({ object, geometry });
    });
    const key = `${sources.map(({ object }) => `${object.uuid}:${object.matrixWorld.elements}`).join("|")}:${world.camera.matrixWorld.elements}:${world.camera.projectionMatrix.elements}:${world.canvas.clientWidth}:${world.canvas.clientHeight}`;
    if (
      key === this.key &&
      sources.length === this.sources.length &&
      sources.every((source, i) => source.geometry === this.sources[i].geometry)
    )
      return this.contents;
    this.key = key;
    this.sources = sources;
    this.contents = {};
    const centers: number[] = [],
      radii: number[] = [],
      directions: number[] = [];
    const view = new THREE.Matrix4().multiplyMatrices(
      world.camera.projectionMatrix,
      world.camera.matrixWorldInverse,
    );
    for (const source of sources) {
      const fit = bodyEllipsoid(source.geometry);
      if (!fit) continue;
      const ellipse = projectBodyEllipsoid(
        fit,
        view.clone().multiply(source.object.matrixWorld),
        world.canvas.clientWidth,
        world.canvas.clientHeight,
      );
      centers.push(ellipse.center.x, ellipse.center.y);
      radii.push(ellipse.radii.x, ellipse.radii.y);
      directions.push(ellipse.direction.x, ellipse.direction.y);
    }
    this.setInstances("center", centers);
    this.setInstances("radii", radii);
    this.setInstances("direction", directions);
    this.geometry.instanceCount = centers.length / 2;
    return this.contents;
  }

  private setInstances(name: string, values: number[]): void {
    const previous = this.geometry.getAttribute(name) as THREE.InstancedBufferAttribute | undefined;
    if (previous && previous.array.length >= values.length) {
      previous.array.set(values);
      previous.needsUpdate = true;
    } else {
      // Dispose the old GPU buffers before replacing attributes on population growth.
      this.geometry.dispose();
      this.geometry.setAttribute(
        name,
        new THREE.InstancedBufferAttribute(new Float32Array(values), 2),
      );
    }
  }

  render(world: World, target: THREE.WebGLRenderTarget, bleed: number, feather = 0): void {
    this.read(world);
    this.material.uniforms.viewport.value.set(world.canvas.clientWidth, world.canvas.clientHeight);
    this.material.uniforms.bleed.value = bleed;
    this.material.uniforms.feather.value = feather;
    this.material.uniforms.pixelWidth.value = world.canvas.clientWidth / target.width;
    world.renderer.setRenderTarget(target);
    world.renderer.render(this.scene, this.camera);
  }

  contains(): boolean {
    return true;
  }

  dispose(): void {
    this.sources = [];
    this.scene.clear();
    this.geometry.dispose();
    this.material.dispose();
  }
}

function xrayOwner(object: THREE.Object3D): boolean {
  for (let owner: THREE.Object3D | null = object; owner; owner = owner.parent)
    if (owner.userData.xrayBody) return true;
  return false;
}
