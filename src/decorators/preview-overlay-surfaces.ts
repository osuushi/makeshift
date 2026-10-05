import * as THREE from "three";
import type { DisplayDocument } from "../model/display-document.js";
import { decoratorAppearance, decoratorPreviewMode } from "../preferences/decorator-display.js";
import type { SketchEditor } from "../sketch/editor.js";
import {
  DecoratorPreviewCompositor,
  decoratorPreviewLayer,
  type PreviewSurface,
  previewFaceKey,
} from "./preview-compositor.js";
import { PreviewFallback } from "./preview-fallback.js";
import type { PackedPreviewMesh } from "./preview-wire.js";
import type { FaceReference } from "./types.js";

interface GeneratedSurface extends PreviewSurface {
  id: string;
  signature: string;
  definition: string;
}

export class PreviewOverlaySurfaces {
  private readonly group = new THREE.Group();
  private readonly compositor = new DecoratorPreviewCompositor();
  private readonly fallback = new PreviewFallback(this.group, this.compositor);
  private readonly surfaces: GeneratedSurface[] = [];
  private definitions = new Map<string, string>();

  constructor(private readonly editor: SketchEditor) {
    editor.world.renderOverlays.add(this.render);
    editor.world.renderForegroundOverlays.add(this.foreground);
    editor.world.scene.add(this.group);
  }

  updateVisibility(): void {
    this.group.visible = this.editor.bodiesVisible;
    this.style();
  }

  sync(signatures: ReadonlyMap<string, string>, document?: DisplayDocument): void {
    // Never leave a generated surface at its old placement or on removed faces.
    for (let index = this.surfaces.length - 1; index >= 0; index--)
      if (this.surfaces[index].signature !== signatures.get(this.surfaces[index].id)) {
        this.remove(this.surfaces[index]);
        this.surfaces.splice(index, 1);
      }
    if (document) {
      this.definitions = new Map(
        document.decorators?.map((instance) => [instance.id, instance.definition]),
      );
      this.fallback.sync(document, signatures);
    }
    this.style();
  }

  replace(
    meshes: ({ id: string; body: string; faces: FaceReference[] } & PackedPreviewMesh)[],
    processedIds: readonly string[],
    signatures: ReadonlyMap<string, string>,
    current: ReadonlyMap<string, string>,
  ): void {
    const applicable = new Set(
      processedIds.filter((id) => signatures.has(id) && signatures.get(id) === current.get(id)),
    );
    for (let index = this.surfaces.length - 1; index >= 0; index--)
      if (applicable.has(this.surfaces[index].id)) {
        this.remove(this.surfaces[index]);
        this.surfaces.splice(index, 1);
      }
    for (const { id, body, faces, positions, indices } of meshes) {
      const signature = signatures.get(id);
      if (signature === undefined || signature !== current.get(id)) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, this.compositor.previewMaterial());
      mesh.userData.body = body;
      mesh.userData.previewCurrent = true;
      mesh.userData.decorator = id;
      mesh.raycast = () => {};
      mesh.layers.set(decoratorPreviewLayer);
      this.group.add(mesh);
      this.surfaces.push({
        mesh,
        faces: new Set(faces.map((face) => previewFaceKey(face.body, face.face))),
        id,
        signature,
        definition: this.definitions.get(id) ?? "custom",
      });
    }
    this.style();
    this.editor.world.requestDraw();
  }

  clear(): void {
    for (const surface of this.surfaces) this.remove(surface);
    this.surfaces.length = 0;
    this.fallback.clear();
  }

  dispose(): void {
    this.clear();
    this.editor.world.renderOverlays.delete(this.render);
    this.editor.world.renderForegroundOverlays.delete(this.foreground);
    this.compositor.dispose();
    this.editor.world.scene.remove(this.group);
  }

  private remove(surface: GeneratedSurface): void {
    this.group.remove(surface.mesh);
    surface.mesh.geometry.dispose();
    (surface.mesh.material as THREE.Material).dispose();
  }

  private style(): PreviewSurface[] {
    const detailed = decoratorPreviewMode() === "detailed";
    const ready = new Set<string>();
    for (const surface of this.surfaces) {
      surface.mesh.visible = detailed && this.editor.visibility.visible(surface.mesh.userData.body);
      const appearance = decoratorAppearance(surface.definition);
      (surface.mesh.material as THREE.MeshStandardMaterial).color.set(appearance.color);
      surface.displayOpacity = appearance.opacity;
      if (surface.mesh.visible && surface.mesh.geometry.attributes.position.count > 0)
        ready.add(`${surface.id}/${surface.mesh.userData.body}`);
    }
    return this.fallback.visible(this.editor, ready);
  }

  private readonly render = () => {
    const attached = this.style();
    if (this.group.visible)
      this.compositor.render(
        this.editor.world.renderer,
        this.editor.world.scene,
        this.editor.world.camera,
        [...this.surfaces, ...attached],
      );
  };

  private readonly foreground = {
    render: this.render,
    hasContent: () => this.group.visible && this.group.children.some((mesh) => mesh.visible),
  };
}
