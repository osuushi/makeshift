import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { SketchEditor } from "../sketch/editor.js";
import { coplanar, type PlaneFrame } from "../sketch/planes.js";
import { stableClipping } from "../sketch/stable-clipping.js";
import { foregroundBodyLayer } from "../sketch/world-foreground.js";
import { faceGeometry, faceMaterial } from "./body-mesh.js";
import type { VisualBody } from "./visual-preview.js";

/** Batch temporary solid faces and outlines; no editable topology is attached. */
export class VisualBodyDrawable {
  readonly group = new THREE.Group();
  private mesh = new THREE.Mesh(new THREE.BufferGeometry(), faceMaterial());
  private onSection = new THREE.Mesh(new THREE.BufferGeometry(), faceMaterial());
  private sectionKey = "";
  private outline = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    stableClipping(new THREE.LineBasicMaterial({ color: "#344657" })),
  );
  private source: VisualBody | null = null;
  constructor() {
    this.group.add(this.mesh, this.onSection, this.outline);
    this.onSection.material.stencilRef = 6;
    this.group.traverse((object) => object.layers.enable(foregroundBodyLayer));
    this.onSection.layers.disable(foregroundBodyLayer);
  }
  update(body: VisualBody, section: PlaneFrame | null = null): void {
    const sectionKey = JSON.stringify(section);
    if (this.source === body && this.sectionKey === sectionKey) return;
    const onSection = body.planes.map((plane) => !!(section && plane && coplanar(section, plane)));
    replaceFaces(
      this.mesh,
      body.faces.filter((_, index) => !onSection[index]),
    );
    replaceFaces(
      this.onSection,
      body.faces.filter((_, index) => onSection[index]),
    );
    const segments: number[] = [];
    for (const points of body.edges)
      for (let i = 3; i < points.length; i += 3) segments.push(...points.slice(i - 3, i + 3));
    const lines = new THREE.BufferGeometry();
    lines.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
    this.outline.geometry.dispose();
    this.outline.geometry = lines;
    this.source = body;
    this.sectionKey = sectionKey;
  }
  dispose(): void {
    for (const object of [this.mesh, this.onSection, this.outline]) {
      object.geometry.dispose();
      object.material.dispose();
    }
    this.group.clear();
  }
}

function replaceFaces(mesh: THREE.Mesh, vertices: number[][]): void {
  const faces = vertices.map(faceGeometry);
  const geometry = faces.length ? mergeGeometries(faces) : new THREE.BufferGeometry();
  for (const face of faces) face.dispose();
  if (!geometry) throw new Error("Could not combine visual preview faces");
  mesh.visible = vertices.length > 0;
  mesh.geometry.dispose();
  mesh.geometry = geometry;
}

export function visualPreviewView(editor: SketchEditor): () => void {
  const drawings: VisualBodyDrawable[] = [];
  const update = () => {
    const bodies = editor.interactions.current?.visualPreview?.bodies ?? [];
    while (drawings.length > bodies.length) {
      const drawing = drawings.pop();
      if (!drawing) break;
      editor.world.scene.remove(drawing.group);
      drawing.dispose();
    }
    for (const [index, body] of bodies.entries()) {
      let drawing = drawings[index];
      if (!drawing) {
        drawing = new VisualBodyDrawable();
        drawings.push(drawing);
        editor.world.scene.add(drawing.group);
      }
      drawing.update(body, editor.world.partialSection ?? editor.world.crossSection);
    }
  };
  editor.world.changed.add(update);
  return () => {
    editor.world.changed.delete(update);
    for (const drawing of drawings) {
      editor.world.scene.remove(drawing.group);
      drawing.dispose();
    }
  };
}
