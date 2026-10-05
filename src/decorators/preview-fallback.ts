import * as THREE from "three";
import type { Face } from "../model/body.js";
import type { DisplayDocument } from "../model/display-document.js";
import { decoratorAppearance } from "../preferences/decorator-display.js";
import type { SketchEditor } from "../sketch/editor.js";
import {
  type DecoratorPreviewCompositor,
  decoratorPreviewLayer,
  type PreviewSurface,
  previewFaceKey,
} from "./preview-compositor.js";

interface AttachedSurface extends PreviewSurface {
  id: string;
  signature: string;
  definition: string;
  sourceFaces: readonly Face[];
}

/** Current trimmed face tessellation is a cheap attachment marker, never a cached decoration. */
export class PreviewFallback {
  private readonly attached = new Map<string, AttachedSurface>();
  constructor(
    private readonly group: THREE.Group,
    private readonly compositor: DecoratorPreviewCompositor,
  ) {}

  sync(document: DisplayDocument, signatures: ReadonlyMap<string, string>): void {
    const kept = new Set<string>();
    for (const instance of document.decorators ?? []) {
      const signature = signatures.get(instance.id);
      if (signature === undefined) continue;
      for (const body of new Set(instance.faces.map((face) => face.body))) {
        const key = `${instance.id}/${body}`;
        const references = instance.faces.filter((face) => face.body === body);
        const sourceFaces = references.flatMap((reference) => {
          const face = document.bodies
            ?.find((body) => body.id === reference.body)
            ?.faces.find((face) => face.id === reference.face);
          return face ? [face] : [];
        });
        if (!sourceFaces.length) continue;
        kept.add(key);
        const previous = this.attached.get(key);
        if (
          previous &&
          previous.sourceFaces.length === sourceFaces.length &&
          previous.sourceFaces.every((face, i) => face === sourceFaces[i])
        ) {
          previous.signature = signature;
          previous.definition = instance.definition;
          continue;
        }
        if (previous) {
          this.remove(previous);
          this.attached.delete(key);
        }
        const vertices: number[] = [];
        for (const face of sourceFaces)
          for (const coordinate of face.vertices) vertices.push(coordinate);
        if (!vertices.length) continue;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, this.compositor.previewMaterial());
        mesh.userData.body = body;
        mesh.userData.previewCurrent = false;
        mesh.userData.previewFallback = true;
        mesh.userData.decorator = instance.id;
        mesh.raycast = () => {};
        mesh.layers.set(decoratorPreviewLayer);
        this.group.add(mesh);
        this.attached.set(key, {
          mesh,
          id: instance.id,
          signature,
          definition: instance.definition,
          sourceFaces,
          faces: new Set(references.map((face) => previewFaceKey(face.body, face.face))),
        });
      }
    }
    for (const [key, surface] of this.attached)
      if (!kept.has(key)) {
        this.remove(surface);
        this.attached.delete(key);
      }
  }

  visible(editor: SketchEditor, ready: ReadonlySet<string>): PreviewSurface[] {
    const result: PreviewSurface[] = [];
    for (const surface of this.attached.values()) {
      surface.mesh.visible =
        !ready.has(`${surface.id}/${surface.mesh.userData.body}`) &&
        editor.visibility.visible(surface.mesh.userData.body);
      const appearance = decoratorAppearance(surface.definition);
      (surface.mesh.material as THREE.MeshStandardMaterial).color.set(appearance.color);
      surface.displayOpacity = appearance.opacity;
      if (surface.mesh.visible) result.push(surface);
    }
    return result;
  }

  clear(): void {
    for (const surface of this.attached.values()) this.remove(surface);
    this.attached.clear();
  }
  private remove(surface: PreviewSurface): void {
    this.group.remove(surface.mesh);
    surface.mesh.geometry.dispose();
    (surface.mesh.material as THREE.Material).dispose();
  }
}
