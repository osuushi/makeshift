import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { PlaneFrame } from "../sketch/planes.js";
import type { BodyGeometry, Edge, Face } from "./body.js";
import { featureEdges } from "./feature-edges.js";
import { planePatchVertices } from "./plane-interior-pick.js";

/** Input ghosts and section edges are decorations, never pickable model entities. */
export class PlaneCutView {
  private targets = new THREE.Group();
  private cutter = new THREE.Group();
  private cutterKey = "";
  private edges = new THREE.Group();
  constructor(private editor: SketchEditor) {
    editor.world.scene.add(this.targets, this.cutter, this.edges);
  }
  showTargets(bodies: { body: BodyGeometry; faces?: string[] }[]): void {
    this.clear(this.targets);
    for (const { body, faces } of bodies) {
      const selected = body.faces.filter((face) => !faces || faces.includes(face.id));
      for (const face of selected) {
        const mesh = this.surface(face.vertices, "#287cbd", 0.16);
        mesh.userData.planeCutTarget = { body: body.id, face: face.id };
        this.targets.add(mesh);
      }
      const boundaries = new Set(selected.flatMap((face) => face.edges));
      for (const edge of featureEdges(body).filter((edge) => boundaries.has(edge.id)))
        this.targets.add(this.line(edge.points, "#287cbd", 1.5, 0.65));
    }
  }
  showCutter(frame: PlaneFrame | null, surface?: { body: BodyGeometry; face: Face }): void {
    const vertices =
      surface?.face.vertices ??
      (frame ? planePatchVertices(frame, this.editor.world.planeBounds(frame)) : []);
    const key = JSON.stringify(vertices);
    if (key === this.cutterKey) return;
    this.cutterKey = key;
    this.clear(this.cutter);
    if (!frame && !surface) return;
    this.cutter.add(this.surface(vertices, "#d08a35", 0.22));
    const outlines = surface
      ? featureEdges(surface.body)
          .filter((edge) => surface.face.edges.includes(edge.id))
          .map((edge) => edge.points)
      : [[...vertices.slice(0, 9), ...vertices.slice(15, 18), ...vertices.slice(0, 3)]];
    for (const outline of outlines) this.cutter.add(this.line(outline, "#d08a35", 2.5, 1));
  }
  showEdges(edges: { body: BodyGeometry; edge: Edge }[]): void {
    this.clear(this.edges);
    for (const { body, edge } of edges) {
      const line = this.line(edge.points, "#c02c9d", 3, 1);
      line.userData.planeCutEdge = { body: body.id, edge: edge.id };
      line.renderOrder = 30;
      this.edges.add(line);
    }
  }
  resize(): void {
    const width = this.editor.world.canvas.clientWidth;
    const height = this.editor.world.canvas.clientHeight;
    for (const group of [this.targets, this.cutter, this.edges])
      for (const object of group.children)
        if (object instanceof Line2) object.material.resolution.set(width, height);
  }
  private surface(vertices: readonly number[], color: string, opacity: number): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color,
        opacity,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.renderOrder = 8;
    return mesh;
  }
  private line(points: readonly number[], color: string, width: number, opacity: number): Line2 {
    const geometry = new LineGeometry();
    geometry.setPositions([...points]);
    const line = new Line2(
      geometry,
      new LineMaterial({
        color,
        linewidth: width,
        opacity,
        transparent: opacity < 1,
        depthTest: false,
        depthWrite: false,
        resolution: new THREE.Vector2(
          this.editor.world.canvas.clientWidth,
          this.editor.world.canvas.clientHeight,
        ),
      }),
    );
    line.renderOrder = 10;
    return line;
  }
  clear(group?: THREE.Group): void {
    if (!group) this.cutterKey = "";
    for (const root of group ? [group] : [this.targets, this.cutter, this.edges]) {
      for (const child of root.children) {
        const object = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
        object.geometry.dispose();
        object.material.dispose();
      }
      root.clear();
    }
  }
  dispose(): void {
    this.clear();
    this.cutterKey = "";
    this.editor.world.scene.remove(this.targets, this.cutter, this.edges);
  }
}
