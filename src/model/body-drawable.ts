import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { previewFaceKey } from "../decorators/preview-compositor.js";
import { coplanar, type PlaneFrame } from "../sketch/planes.js";
import { stableClipping } from "../sketch/stable-clipping.js";
import { foregroundBodyLayer } from "../sketch/world-foreground.js";
import type { BodyGeometry, Edge } from "./body.js";
import { defaultBodyAppearance } from "./body-appearance.js";
import { faceGeometry, faceMaterial } from "./body-mesh.js";
import { decoratorErrorMaterial, setDecoratorError } from "./decorator-error-material.js";
import { featureEdges } from "./feature-edges.js";

interface Counts {
  created: number;
  disposed: number;
}
function sameValues<T>(a: readonly T[], b: readonly T[]): boolean {
  return a === b || (a.length === b.length && a.every((value, i) => value === b[i]));
}
/** Transport copies can reuse GPU geometry only when their actual drawable inputs agree. */
export function sameBodyDrawing(a: BodyGeometry, b: BodyGeometry): boolean {
  if (a === b) return true;
  if (a.id !== b.id || a.faces.length !== b.faces.length) return false;
  if (
    !a.faces.every(
      (face, i) => face.id === b.faces[i].id && sameValues(face.vertices, b.faces[i].vertices),
    )
  )
    return false;
  const A = featureEdges(a),
    B = featureEdges(b);
  return (
    A.length === B.length &&
    A.every((edge, i) => edge.id === B[i].id && sameValues(edge.points, B[i].points))
  );
}

function edgeHighlight(edge: Edge): Line2 {
  const geometry = new LineGeometry();
  geometry.setPositions(edge.points);
  const line = new Line2(
    geometry,
    stableClipping(
      new LineMaterial({
        linewidth: 4,
        depthTest: false,
        depthWrite: false,
      }),
    ),
  );
  line.renderOrder = 20;
  line.layers.enable(foregroundBodyLayer);
  return line;
}
function disposeDrawable(object: THREE.Object3D): void {
  const drawable = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  drawable.geometry?.dispose();
  drawable.material?.dispose();
}

/** Own one body's presentation resources, independently of hover, selection and visibility. */
export class BodyDrawable {
  readonly group = new THREE.Group();
  private faces: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  private edges: THREE.Line[] = [];
  private highlights = new Map<string, { edge: Edge; line: Line2 }>();
  constructor(
    private body: BodyGeometry,
    private counts: Counts,
  ) {
    const source = body;
    for (const face of source.faces) {
      const mesh = new THREE.Mesh(faceGeometry(face.vertices), faceMaterial());
      decoratorErrorMaterial(mesh.material);
      mesh.userData.bodyFace = { body: source.id, face: face.id };
      mesh.userData.decoratorFace = previewFaceKey(source.id, face.id);
      this.faces.push(mesh);
      this.group.add(mesh);
      counts.created++;
    }
    for (const edge of featureEdges(source)) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(edge.points, 3));
      const line = new THREE.Line(
        geometry,
        stableClipping(new THREE.LineBasicMaterial({ color: "#344657" })),
      );
      this.edges.push(line);
      this.group.add(line);
    }
    this.group.traverse((object) => object.layers.enable(foregroundBodyLayer));
  }
  get source(): BodyGeometry {
    return this.body;
  }
  reuse(body: BodyGeometry): boolean {
    if (!sameBodyDrawing(this.body, body)) {
      const edges = featureEdges(body);
      if (body.faces.length !== this.faces.length || edges.length !== this.edges.length)
        return false;
      // These are presentation slots, not topology identities. Replace all
      // geometric inputs and picking IDs while retaining compatible materials.
      this.faces.forEach((mesh, i) => {
        const face = body.faces[i];
        const geometry = faceGeometry(face.vertices);
        mesh.geometry.dispose();
        mesh.geometry = geometry;
        mesh.userData.bodyFace = { body: body.id, face: face.id };
        mesh.userData.decoratorFace = previewFaceKey(body.id, face.id);
        this.counts.created++;
        this.counts.disposed++;
      });
      this.edges.forEach((line, i) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(edges[i].points, 3));
        line.geometry.dispose();
        line.geometry = geometry;
      });
    }
    this.body = body;
    return true;
  }
  style(
    selectedBodies: ReadonlySet<string>,
    selectedFaces: ReadonlySet<string>,
    hover: string | boolean | undefined,
    section: PlaneFrame | null,
    appearance = defaultBodyAppearance,
    invalidFaces: ReadonlySet<string> = new Set(),
  ): void {
    this.faces.forEach((mesh, i) => {
      const face = this.source.faces[i];
      const selected = selectedBodies.has(this.source.id) || selectedFaces.has(face.id);
      setDecoratorError(mesh.material, invalidFaces.has(face.id), selected);
      mesh.userData.decoratorInvalid = invalidFaces.has(face.id);
      mesh.material.color.set(
        selectedBodies.has(this.source.id) || selectedFaces.has(face.id)
          ? "#82b5e0"
          : hover === true || hover === face.id
            ? "#ead3aa"
            : appearance.color,
      );
      const transparent = appearance.alpha < 1;
      if (mesh.material.transparent !== transparent) {
        mesh.material.transparent = transparent;
        mesh.material.needsUpdate = true;
      }
      mesh.material.opacity = appearance.alpha;
      mesh.material.depthWrite = !transparent;
      mesh.material.stencilWrite = !transparent;
      const onSection = !!(section && face.plane && coplanar(section, face.plane));
      mesh.material.stencilRef = onSection ? 6 : 2;
      // Coplanar faces belong wholly to the main pass. Re-clipping them at the
      // complementary tolerance can produce floating-point triangle fragments.
      if (onSection) mesh.layers.disable(foregroundBodyLayer);
      else mesh.layers.enable(foregroundBodyLayer);
    });
  }
  highlight(source: BodyGeometry, selected: ReadonlySet<string>, hover?: string): void {
    const edges = featureEdges(source).filter((edge) => selected.has(edge.id) || hover === edge.id);
    for (const [id, highlight] of this.highlights) {
      const next = edges.find((edge) => edge.id === id);
      if (next && sameValues(next.points, highlight.edge.points)) continue;
      this.group.remove(highlight.line);
      disposeDrawable(highlight.line);
      this.highlights.delete(id);
    }
    for (const edge of edges) {
      let highlight = this.highlights.get(edge.id);
      if (!highlight) {
        highlight = { edge, line: edgeHighlight(edge) };
        this.highlights.set(edge.id, highlight);
        this.group.add(highlight.line);
      }
      highlight.edge = edge;
      highlight.line.material.color.set(selected.has(edge.id) ? "#1676d2" : "#e18a16");
    }
  }
  dispose(): void {
    this.counts.disposed += this.faces.length;
    this.group.traverse(disposeDrawable);
    this.group.clear();
    this.faces = [];
    this.edges = [];
    this.highlights.clear();
  }
}
