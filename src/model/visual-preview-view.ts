import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { SketchEditor } from "../sketch/editor.js";
import { coplanar, type PlaneFrame } from "../sketch/planes.js";
import { stableClipping } from "../sketch/stable-clipping.js";
import { foregroundBodyLayer } from "../sketch/world-foreground.js";
import { defaultBodyAppearance } from "./body-appearance.js";
import { faceGeometry, faceMaterial } from "./body-mesh.js";
import type { VisualBody } from "./visual-preview.js";

interface VisualStyle {
  color: string;
  alpha: number;
  selected: string[];
}
const defaultStyle: VisualStyle = { ...defaultBodyAppearance, selected: [] };

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
  private highlight = new LineSegments2(
    new LineSegmentsGeometry(),
    stableClipping(
      new LineMaterial({ color: "#1676d2", linewidth: 4, depthTest: false, depthWrite: false }),
    ),
  );
  constructor() {
    this.group.add(this.mesh, this.onSection, this.outline, this.highlight);
    this.highlight.renderOrder = 20;
    for (const mesh of [this.mesh, this.onSection]) {
      mesh.userData.bodyMask = true;
      mesh.material.vertexColors = true;
      mesh.material.color.set("white");
    }
    this.onSection.material.stencilRef = 6;
    this.group.traverse((object) => object.layers.enable(foregroundBodyLayer));
    this.onSection.layers.disable(foregroundBodyLayer);
  }
  update(body: VisualBody, section: PlaneFrame | null = null, style = defaultStyle): void {
    const sectionKey = JSON.stringify([section, style]);
    if (this.source === body && this.sectionKey === sectionKey) return;
    const onSection = body.planes.map((plane) => !!(section && plane && coplanar(section, plane)));
    const selectedBody = body.sourceBodies?.some((id) => style.selected.includes(id));
    const colors = body.faces.map((_, index) =>
      selectedBody || body.sourceFaces?.[index].some((id) => style.selected.includes(id))
        ? "#82b5e0"
        : style.color,
    );
    for (const [mesh, clipped] of [
      [this.mesh, false],
      [this.onSection, true],
    ] as const) {
      replaceFaces(
        mesh,
        body.faces.filter((_, i) => onSection[i] === clipped),
        colors.filter((_, i) => onSection[i] === clipped),
      );
      const transparent = style.alpha < 1;
      if (mesh.material.transparent !== transparent) mesh.material.needsUpdate = true;
      mesh.material.transparent = transparent;
      mesh.material.opacity = style.alpha;
      mesh.material.depthWrite = mesh.material.stencilWrite = !transparent;
    }
    const segments: number[] = [];
    const highlighted: number[] = [];
    for (const [index, points] of body.edges.entries()) {
      const selected = body.sourceEdges?.[index].some((id) => style.selected.includes(id));
      for (let i = 3; i < points.length; i += 3) {
        const pair = points.slice(i - 3, i + 3);
        segments.push(...pair);
        if (selected) highlighted.push(...pair);
      }
    }
    const lines = new THREE.BufferGeometry();
    lines.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
    this.outline.geometry.dispose();
    this.outline.geometry = lines;
    this.highlight.geometry.dispose();
    this.highlight.geometry = new LineSegmentsGeometry().setPositions(highlighted);
    this.highlight.visible = highlighted.length > 0;
    this.source = body;
    this.sectionKey = sectionKey;
  }
  dispose(): void {
    for (const object of [this.mesh, this.onSection, this.outline, this.highlight]) {
      object.geometry.dispose();
      object.material.dispose();
    }
    this.group.clear();
  }
}

function replaceFaces(mesh: THREE.Mesh, vertices: number[][], colors: string[]): void {
  const faces = vertices.map((points, i) => {
    const face = faceGeometry(points),
      color = new THREE.Color(colors[i]);
    const attribute = new THREE.Float32BufferAttribute(
      new Float32Array(face.getAttribute("position").count * 3),
      3,
    );
    for (let j = 0; j < attribute.count; j++) attribute.setXYZ(j, color.r, color.g, color.b);
    face.setAttribute("color", attribute);
    return face;
  });
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
      const appearance =
        editor.store.data.bodyAppearances?.find((entry) =>
          body.sourceBodies?.includes(entry.body),
        ) ?? defaultBodyAppearance;
      const selected = editor.modeling.targets.flatMap((target) =>
        target.kind === "body"
          ? [target.body]
          : target.kind === "face"
            ? [target.face]
            : target.kind === "edge"
              ? [target.edge]
              : [],
      );
      drawing.group.visible =
        !body.sourceBodies?.length ||
        (editor.bodiesVisible && body.sourceBodies.some((id) => editor.visibility.visible(id)));
      drawing.group.userData.xrayBody =
        body.sourceBodies?.length && body.sourceBodies.every((id) => editor.visibility.xray.has(id))
          ? body.sourceBodies[0]
          : null;
      drawing.update(body, editor.world.partialSection ?? editor.world.crossSection, {
        ...appearance,
        selected,
      });
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
