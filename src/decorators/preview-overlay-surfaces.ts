import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import {
  DecoratorPreviewCompositor,
  decoratorPreviewLayer,
  type PreviewSurface,
  previewFaceKey,
} from "./preview-compositor.js";
import { PreviewFade } from "./preview-fade.js";
import type { PackedPreviewMesh } from "./preview-wire.js";
import type { FaceReference } from "./types.js";

interface FadingSurface extends PreviewSurface {
  fade: PreviewFade;
  id: string;
  signature: string;
  live: boolean;
}

export class PreviewOverlaySurfaces {
  private readonly group = new THREE.Group();
  private readonly compositor = new DecoratorPreviewCompositor();
  private readonly surfaces: FadingSurface[] = [];
  private animation: number | null = null;

  constructor(private readonly editor: SketchEditor) {
    editor.world.renderOverlays.add(this.render);
    editor.world.renderForegroundOverlays.add(this.foreground);
    editor.world.scene.add(this.group);
  }

  updateVisibility(): void {
    this.group.visible = this.editor.bodiesVisible;
    for (const child of this.group.children)
      child.visible = this.editor.visibility.visible(child.userData.body);
  }

  sync(signatures: ReadonlyMap<string, string>): void {
    const now = performance.now();
    let changing = false;
    for (const surface of this.surfaces) {
      if (!surface.fade.current) continue;
      if (surface.signature === signatures.get(surface.id)) surface.fade.restore(now);
      else surface.fade.stale(now);
      changing ||= surface.fade.animating(now);
    }
    if (changing) this.animate();
  }

  replace(
    meshes: ({ id: string; body: string; faces: FaceReference[] } & PackedPreviewMesh)[],
    processedIds: readonly string[],
    signatures: ReadonlyMap<string, string>,
    current: ReadonlyMap<string, string>,
    live: boolean,
  ) {
    const now = performance.now();
    const applicable = new Set(
      processedIds.filter((id) => signatures.has(id) && signatures.get(id) === current.get(id)),
    );
    for (const surface of this.surfaces)
      if (surface.fade.current && applicable.has(surface.id)) {
        surface.fade.replace(now);
        surface.mesh.userData.previewCurrent = false;
      }
    for (const { id, body, faces, positions, indices } of meshes) {
      const signature = signatures.get(id);
      if (signature === undefined || signature !== current.get(id)) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeVertexNormals();
      const overlay = new THREE.Mesh(geometry, this.compositor.previewMaterial());
      overlay.userData.body = body;
      overlay.userData.previewCurrent = true;
      overlay.raycast = () => {};
      overlay.layers.set(decoratorPreviewLayer);
      overlay.visible = this.editor.visibility.visible(body);
      this.group.add(overlay);
      const fade = new PreviewFade(now);
      this.surfaces.push({
        mesh: overlay,
        faces: new Set(faces.map((f) => previewFaceKey(f.body, f.face))),
        fade,
        id,
        signature,
        live,
      });
    }
    this.animate();
    this.editor.world.requestDraw();
  }

  clear(): void {
    for (const surface of this.surfaces) this.remove(surface);
    this.surfaces.length = 0;
  }

  dispose(): void {
    if (this.animation !== null) cancelAnimationFrame(this.animation);
    this.clear();
    this.editor.world.renderOverlays.delete(this.render);
    this.editor.world.renderForegroundOverlays.delete(this.foreground);
    this.compositor.dispose();
    this.editor.world.scene.remove(this.group);
  }

  private remove(surface: FadingSurface): void {
    const mesh = surface.mesh as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    mesh.geometry.dispose();
    mesh.material.dispose();
    this.group.remove(mesh);
  }

  private readonly render = () => {
    const now = performance.now();
    for (let index = this.surfaces.length - 1; index >= 0; index--) {
      const surface = this.surfaces[index];
      surface.opacity = surface.fade.opacity(now);
      if (surface.opacity === 0 && !surface.fade.animating(now)) {
        this.surfaces.splice(index, 1);
        this.remove(surface);
      }
    }
    if (this.group.visible)
      this.compositor.render(
        this.editor.world.renderer,
        this.editor.world.scene,
        this.editor.world.camera,
        this.surfaces,
      );
  };

  private readonly foreground = {
    render: this.render,
    hasContent: () => this.group.visible && this.surfaces.some(({ mesh }) => mesh.visible),
  };

  private animate(): void {
    if (this.animation !== null) return;
    this.animation = requestAnimationFrame(() => {
      this.animation = null;
      this.editor.world.requestDraw();
      if (this.surfaces.some(({ fade }) => fade.animating(performance.now()))) this.animate();
    });
  }
}
