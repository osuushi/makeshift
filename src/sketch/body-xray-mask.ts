import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { World } from "./world.js";
import type { XrayAperture } from "./xray-composite.js";

/** Whole-body silhouette union. Wide triangle edges dilate even curved silhouettes,
 * using the same round screen-space strokes as sketch apertures. Geometry is shared. */
export class BodyXrayMask implements XrayAperture {
  private readonly scene = new THREE.Scene();
  private readonly fill = new THREE.MeshBasicMaterial({
    color: "white",
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly stroke = new LineMaterial({
    color: "white",
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly drawings = new Map<
    THREE.Mesh,
    {
      geometry: THREE.BufferGeometry;
      mesh: THREE.Mesh;
      lines: LineSegments2;
    }
  >();
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
    for (const [source, drawing] of this.drawings) {
      if (sources.includes(source) && source.geometry === drawing.geometry) continue;
      drawing.lines.geometry.dispose();
      this.scene.remove(drawing.mesh, drawing.lines);
      this.drawings.delete(source);
    }
    for (const source of sources) {
      let drawing = this.drawings.get(source);
      if (!drawing) {
        const positions = source.geometry.getAttribute("position");
        const index = source.geometry.index;
        const edges: number[] = [];
        for (let i = 0; i < (index?.count ?? positions.count); i += 3)
          for (const [a, b] of [
            [0, 1],
            [1, 2],
            [2, 0],
          ])
            for (const j of [a, b]) {
              const n = index ? index.getX(i + j) : i + j;
              edges.push(positions.getX(n), positions.getY(n), positions.getZ(n));
            }
        const geometry = new LineSegmentsGeometry();
        geometry.setPositions(edges);
        drawing = {
          geometry: source.geometry,
          mesh: new THREE.Mesh(source.geometry, this.fill),
          lines: new LineSegments2(geometry, this.stroke),
        };
        this.drawings.set(source, drawing);
        this.scene.add(drawing.mesh, drawing.lines);
      }
      for (const object of [drawing.mesh, drawing.lines]) {
        object.matrixAutoUpdate = false;
        object.matrix.copy(source.matrixWorld);
        object.frustumCulled = false;
      }
    }
    return this.contents;
  }

  render(world: World, target: THREE.WebGLRenderTarget, bleed: number): void {
    this.read(world);
    this.stroke.resolution.set(world.canvas.clientWidth, world.canvas.clientHeight);
    this.stroke.linewidth = Math.max(2, bleed * 2);
    world.renderer.setRenderTarget(target);
    world.renderer.render(this.scene, world.camera);
  }

  contains(): boolean {
    return true;
  }

  dispose(): void {
    for (const drawing of this.drawings.values()) drawing.lines.geometry.dispose();
    this.drawings.clear();
    this.fill.dispose();
    this.stroke.dispose();
  }
}

function xrayOwner(object: THREE.Object3D): boolean {
  for (let owner: THREE.Object3D | null = object; owner; owner = owner.parent)
    if (owner.userData.xrayBody) return true;
  return false;
}
