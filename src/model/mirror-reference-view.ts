import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { SketchEditor } from "../sketch/editor.js";
import { worldPoint } from "../sketch/planes.js";
import type { MirrorReference } from "./mirror-reference.js";

/** The temporary mirror reference is scene decoration, never document geometry. */
export class MirrorReferenceView {
  private group = new THREE.Group();
  private key = "";
  constructor(
    private editor: SketchEditor,
    private hover = false,
  ) {
    editor.world.scene.add(this.group);
  }
  show(reference: MirrorReference | null): void {
    const key = JSON.stringify([
      reference,
      this.editor.world.height,
      this.editor.world.target.toArray(),
      this.editor.world.activeFrame,
      this.editor.world.canvas.clientWidth,
      this.editor.world.canvas.clientHeight,
    ]);
    if (key === this.key) return;
    this.key = key;
    this.clear();
    if (!reference) return;
    const reach = this.editor.world.height * 0.4;
    if (reference.kind === "line") this.showLine(reference, reach);
    else this.showPlane(reference, reach);
  }
  private showLine(reference: Extract<MirrorReference, { kind: "line" }>, reach: number): void {
    const frame = this.editor.world.activeFrame;
    if (!frame) return;
    const { origin: o, direction: d } = reference.line,
      length = Math.hypot(d.x, d.y);
    const target = this.editor.world.target.clone().sub(new THREE.Vector3(...frame.origin));
    const along =
      ((target.dot(new THREE.Vector3(...frame.u)) - o.x) * d.x +
        (target.dot(new THREE.Vector3(...frame.v)) - o.y) * d.y) /
      length;
    const span =
      this.editor.world.height *
      Math.max(1, this.editor.world.canvas.clientWidth / this.editor.world.canvas.clientHeight);
    const points =
      this.hover && reference.segment
        ? reference.segment.map((point) => new THREE.Vector3(...worldPoint(frame, point)))
        : [along - span, along + span].map(
            (t) =>
              new THREE.Vector3(
                ...worldPoint(frame, { x: o.x + (d.x / length) * t, y: o.y + (d.y / length) * t }),
              ),
          );
    const geometry = new LineGeometry();
    geometry.setPositions(points.flatMap((point) => point.toArray()));
    const line = new Line2(
      geometry,
      new LineMaterial({
        color: this.hover ? "#1676d2" : "#a66a16",
        linewidth: this.hover ? 3 : 1.5,
        dashed: !this.hover,
        dashSize: reach / 30,
        gapSize: reach / 60,
        depthTest: false,
        depthWrite: false,
        resolution: new THREE.Vector2(
          this.editor.world.canvas.clientWidth,
          this.editor.world.canvas.clientHeight,
        ),
      }),
    );
    line.computeLineDistances();
    line.renderOrder = 25;
    this.group.add(line);
  }
  private showPlane(reference: Extract<MirrorReference, { kind: "plane" }>, reach: number): void {
    const geometry = new THREE.BufferGeometry();
    const face = this.hover && reference.vertices;
    if (face) geometry.setAttribute("position", new THREE.Float32BufferAttribute(face, 3));
    const mesh = new THREE.Mesh(
      face ? geometry : new THREE.PlaneGeometry(reach, reach),
      new THREE.MeshBasicMaterial({
        color: this.hover ? "#1676d2" : "#a66a16",
        transparent: true,
        opacity: this.hover ? 0.4 : 0.16,
        depthTest: !this.hover,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    if (!face) {
      geometry.dispose();
      mesh.position.set(...reference.plane.origin);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(...reference.plane.normal),
      );
    }
    mesh.renderOrder = 25;
    this.group.add(mesh);
  }
  private clear(): void {
    for (const child of this.group.children) {
      const object = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      object.geometry.dispose();
      object.material.dispose();
    }
    this.group.clear();
  }
  dispose(): void {
    this.clear();
    this.editor.world.scene.remove(this.group);
  }
}
