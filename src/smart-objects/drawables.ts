import * as THREE from "three";
import { defaultBodyAppearance } from "../model/body-appearance.js";
import { faceGeometry } from "../model/body-mesh.js";
import type { LinkedBench } from "../model/smart-object.js";
import { viewportPalette } from "../preferences/viewport-theme.js";
import { displayPoints } from "../sketch/curve-geometry.js";
import { boundaryPoints } from "../sketch/curve-spans.js";
import { worldPoint } from "../sketch/planes.js";
import { profilesFor } from "../sketch/profiles.js";
import { stableClipping } from "../sketch/stable-clipping.js";

type Part = {
  kind: "body" | "edge" | "line" | "profile";
  geometry: THREE.BufferGeometry;
  id?: string;
};
type Drawable = (
  | THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial | THREE.MeshBasicMaterial>
  | THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>
) & { visible: boolean };

function segments(points: ArrayLike<number>, positions: number[]) {
  for (let i = 3; i < points.length; i += 3)
    positions.push(
      points[i - 3],
      points[i - 2],
      points[i - 1],
      points[i],
      points[i + 1],
      points[i + 2],
    );
}

function geometry(positions: number[]): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
}

export class LinkedGeometry {
  readonly parts: Part[] = [];
  readonly bounds = new THREE.Box3();
  constructor(readonly source: LinkedBench) {
    const positions: number[] = [];
    const edges: number[] = [];
    for (const body of source.bodies ?? []) {
      for (const face of body.faces)
        this.parts.push({
          kind: "body",
          id: body.id,
          geometry: faceGeometry(face.vertices, face.normals),
        });
      for (const edge of body.edges) segments(edge.points, edges);
    }
    const regions: number[] = [];
    for (const sketch of source.sketches) {
      for (const curve of sketch.curves)
        segments(
          displayPoints(curve, 0.01).flatMap((p) => worldPoint(sketch.plane, p)),
          positions,
        );
      for (const profile of profilesFor(sketch)) {
        const [contour, ...holes] = [profile.outer, ...profile.holes].map((boundary) =>
          boundaryPoints(boundary, 0.01).map(({ x, y }) => new THREE.Vector2(x, y)),
        );
        const triangles = THREE.ShapeUtils.triangulateShape(contour, holes);
        const points = [contour, ...holes].flat();
        for (const triangle of triangles)
          for (const index of triangle) regions.push(...worldPoint(sketch.plane, points[index]));
      }
    }
    if (positions.length) this.parts.push({ kind: "line", geometry: geometry(positions) });
    if (edges.length) this.parts.push({ kind: "edge", geometry: geometry(edges) });
    if (regions.length) this.parts.push({ kind: "profile", geometry: geometry(regions) });
    for (const part of this.parts) {
      part.geometry.computeBoundingBox();
      if (part.geometry.boundingBox) this.bounds.union(part.geometry.boundingBox);
    }
  }

  matches(next: LinkedBench): boolean {
    return this.source.sketches === next.sketches && this.source.bodies === next.bodies;
  }

  dispose(): void {
    for (const part of this.parts) part.geometry.dispose();
  }
}

function drawable(part: Part): Drawable {
  if (part.kind === "line" || part.kind === "edge")
    return new THREE.LineSegments(part.geometry, stableClipping(new THREE.LineBasicMaterial()));
  if (part.kind === "profile")
    return new THREE.Mesh(
      part.geometry,
      stableClipping(
        new THREE.MeshBasicMaterial({
          side: THREE.DoubleSide,
          depthWrite: false,
          transparent: true,
        }),
      ),
    );
  return new THREE.Mesh(
    part.geometry,
    stableClipping(
      new THREE.MeshStandardMaterial({
        roughness: 0.75,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    ),
  );
}

export class LinkedDrawable {
  readonly group = new THREE.Group();
  private readonly nodes: Drawable[];
  constructor(readonly geometry: LinkedGeometry) {
    this.group.matrixAutoUpdate = false;
    this.nodes = geometry.parts.map(drawable);
    for (const node of this.nodes) this.group.add(node);
  }

  style(
    source: LinkedBench,
    context: boolean,
    selected: boolean,
    hovered: boolean,
    showBodies: boolean,
  ): void {
    const palette = viewportPalette();
    for (const [i, node] of this.nodes.entries()) {
      const part = this.geometry.parts[i];
      node.visible = showBodies || (part.kind !== "body" && part.kind !== "edge");
      const appearance =
        source.bodyAppearances?.find(({ body }) => body === part.id) ?? defaultBodyAppearance;
      const ink = part.kind === "body" ? appearance.color : palette.ink;
      const color = selected ? palette.selectionStroke : hovered ? palette.hover : ink;
      node.material.color.set(color);
      const opacity =
        part.kind === "profile"
          ? selected
            ? 0.35
            : 0.13
          : part.kind === "body"
            ? appearance.alpha
            : 1;
      node.material.opacity = context ? opacity * 0.25 : opacity;
      const transparent = node.material.opacity < 1;
      if (transparent !== node.material.transparent) {
        node.material.transparent = transparent;
        node.material.needsUpdate = true;
      }
      node.material.depthWrite = !transparent && part.kind === "body";
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const node of this.nodes) node.material.dispose();
  }
}
