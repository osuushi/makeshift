import * as THREE from "three";
import { displayPoints } from "../sketch/curve-geometry.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type Vector, worldPoint } from "../sketch/planes.js";
import type { GuideAnchor } from "./types.js";

/** Independent highlight: inspecting a guide never selects its parent for editing. */
export class GuideHighlight {
  private fill = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({
      color: "#8b5cf6",
      transparent: true,
      opacity: 0.22,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  private line = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: "#8b5cf6", depthTest: false, depthWrite: false }),
  );
  constructor(private editor: SketchEditor) {
    this.line.renderOrder = 40;
    this.fill.renderOrder = 39;
    editor.world.scene.add(this.line, this.fill);
  }
  show(anchors: GuideAnchor | readonly GuideAnchor[] | null): void {
    const strips: Vector[][] = [];
    const triangles: number[] = [];
    const document = this.editor.display;
    for (const anchor of anchors
      ? Array.isArray(anchors)
        ? anchors
        : [anchors as GuideAnchor]
      : []) {
      if (anchor?.kind === "sketch-curve") {
        const sketch = document.sketches.find((s) => s.id === anchor.sketch);
        const curve = sketch?.curves.find((c) => c.id === anchor.curve);
        if (sketch && curve)
          strips.push(
            displayPoints(
              curve,
              this.editor.world.height / this.editor.world.canvas.clientHeight,
            ).map((p) => worldPoint(sketch.plane, p)),
          );
      } else if (anchor) {
        const body = document.bodies?.find((b) => b.id === anchor.body);
        if (anchor.kind === "body-faces" || anchor.kind === "body-center")
          for (const face of body?.faces ?? [])
            if (anchor.kind === "body-center" || anchor.faces.includes(face.id))
              triangles.push(...face.vertices);
        const ids =
          anchor.kind === "body-edge"
            ? [anchor.edge]
            : anchor.kind === "body-junction"
              ? anchor.edges
              : anchor.kind === "body-faces"
                ? body?.faces.filter((f) => anchor.faces.includes(f.id)).flatMap((f) => f.edges)
                : body?.edges.map((e) => e.id);
        for (const edge of body?.edges ?? [])
          if (ids?.includes(edge.id))
            strips.push(
              Array.from(
                { length: edge.points.length / 3 },
                (_, i) => edge.points.slice(i * 3, i * 3 + 3) as Vector,
              ),
            );
      }
    }
    const positions = strips.flatMap((strip) =>
      strip.slice(1).flatMap((p, i) => [...strip[i], ...p]),
    );
    this.line.geometry.dispose();
    this.line.geometry = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    this.line.visible = positions.length > 0;
    this.fill.geometry.dispose();
    this.fill.geometry = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(triangles, 3),
    );
    this.fill.visible = triangles.length > 0;
  }
  dispose(): void {
    this.editor.world.scene.remove(this.line, this.fill);
    this.fill.geometry.dispose();
    this.fill.material.dispose();
    this.line.geometry.dispose();
    this.line.material.dispose();
  }
}
