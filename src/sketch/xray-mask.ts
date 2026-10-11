import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { Sketch } from "./document.js";
import type { Point } from "./planes.js";
import type { World } from "./world.js";
import { projectXrayContents, type XrayContents, xrayContains } from "./xray-contents.js";

/** White region union plus round wide strokes performs screen-space dilation. */
export class XrayMask {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);
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
  private readonly mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.fill);
  private readonly lines = new LineSegments2(new LineSegmentsGeometry(), this.stroke);
  private sketches: readonly Sketch[] | null = null;
  private key = "";
  private contents: XrayContents = { paths: [], regions: [] };

  constructor() {
    this.scene.background = new THREE.Color("black");
    this.scene.add(this.mesh, this.lines);
    this.mesh.frustumCulled = this.lines.frustumCulled = false;
  }

  read(world: World): XrayContents {
    const source = world.xraySource();
    const frame = world.partialSection;
    const width = world.canvas.clientWidth,
      height = world.canvas.clientHeight;
    const key = `${source.visibility}:${world.camera.matrixWorld.elements}:${world.camera.projectionMatrix.elements}:${JSON.stringify(frame)}:${width}:${height}`;
    if (this.sketches === source.sketches && this.key === key) return this.contents;
    this.key = key;
    this.sketches = source.sketches;
    this.contents = frame
      ? projectXrayContents(
          source.sketches.filter((s) => source.visible(s.id)),
          frame,
          (p) => {
            const v = new THREE.Vector3(...p).project(world.camera);
            return { x: ((v.x + 1) * width) / 2, y: ((1 - v.y) * height) / 2 };
          },
          world.height / height,
        )
      : { paths: [], regions: [] };
    this.rebuild();
    this.camera.right = width;
    this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
    this.stroke.resolution.set(width, height);
    return this.contents;
  }

  contains(world: World, point: Point, bleed: number): boolean {
    const rect = world.canvas.getBoundingClientRect();
    return xrayContains(this.read(world), { x: point.x - rect.left, y: point.y - rect.top }, bleed);
  }

  render(world: World, target: THREE.WebGLRenderTarget, bleed: number): void {
    this.read(world);
    this.stroke.linewidth = Math.max(2, bleed * 2);
    world.renderer.setRenderTarget(target);
    world.renderer.render(this.scene, this.camera);
  }

  private rebuild(): void {
    const positions: number[] = [],
      segments: number[] = [];
    for (const polygon of this.contents.regions) {
      const contour = polygon.map((p) => new THREE.Vector2(p.x, p.y));
      for (const triangle of THREE.ShapeUtils.triangulateShape(contour, []))
        for (const i of triangle) positions.push(polygon[i].x, polygon[i].y, 0);
    }
    for (const path of this.contents.paths)
      for (let i = 1; i < path.length; i++)
        segments.push(path[i - 1].x, path[i - 1].y, 0, path[i].x, path[i].y, 0);
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    this.mesh.visible = positions.length > 0;
    this.lines.geometry.dispose();
    this.lines.geometry = new LineSegmentsGeometry();
    if (segments.length) this.lines.geometry.setPositions(segments);
    this.lines.visible = segments.length > 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.lines.geometry.dispose();
    this.fill.dispose();
    this.stroke.dispose();
  }
}
