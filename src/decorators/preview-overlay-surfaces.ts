import * as THREE from "three";
import type { DisplayDocument } from "../model/display-document.js";
import { decoratorAppearance, decoratorPreviewMode } from "../preferences/decorator-display.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type DecoratorDisplayMode, effectiveDecoratorDisplay } from "./display-mode.js";
import { gearColor } from "./gear-colors.js";
import { normalProjectionSurface } from "./normal-projection-surface.js";
import {
  DecoratorPreviewCompositor,
  decoratorPreviewLayer,
  type PreviewSurface,
  previewFaceKey,
} from "./preview-compositor.js";
import { PreviewFallback } from "./preview-fallback.js";
import type { PackedPreviewMesh } from "./preview-wire.js";
import { threadNormalSurface } from "./thread-normal-surface.js";
import { threadPreviewPlanes } from "./thread-preview-surface.js";
import { threadDefinition } from "./thread-settings.js";
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
  private displayModes = new Map<string, DecoratorDisplayMode | undefined>();
  private colors = new Map<string, string>();
  private clipping = new Map<string, THREE.Plane[]>();
  private pulseFrame: number | null = null;

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
      this.displayModes = new Map(
        document.decorators?.map((instance) => [instance.id, instance.display]),
      );
      this.colors = new Map(
        document.decorators?.map((d) => [d.id, gearColor(d, document.decorators ?? [])]),
      );
      this.definitions = new Map(
        document.decorators?.map((instance) => [instance.id, instance.definition]),
      );
      this.clipping = new Map(
        document.decorators?.flatMap((instance) => {
          if (instance.definition !== threadDefinition) return [];
          const bodies = document.bodies ?? [];
          const faces = instance.faces.flatMap((reference) => {
            const face = bodies
              .find((body) => body.id === reference.body)
              ?.faces.find((face) => face.id === reference.face);
            return face ? [face] : [];
          });
          const adjacent = bodies
            .filter((body) => instance.faces.some((reference) => reference.body === body.id))
            .flatMap((body) => body.faces);
          return [
            [
              instance.id,
              threadPreviewPlanes(faces, adjacent).map(
                ({ normal, constant }) => new THREE.Plane(new THREE.Vector3(...normal), constant),
              ),
            ] as const,
          ];
        }),
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
    for (const {
      id,
      body,
      faces,
      positions,
      indices,
      occlusion,
      projections,
      textures,
    } of meshes) {
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
      let occluder: THREE.Mesh | undefined;
      if (occlusion) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(occlusion.positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(occlusion.indices, 1));
        occluder = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
        );
        occluder.visible = false;
        occluder.raycast = () => {};
        this.group.add(occluder);
      }
      this.surfaces.push({
        mesh,
        occluder,
        faces: new Set(faces.map((face) => previewFaceKey(face.body, face.face))),
        id,
        signature,
        definition: this.definitions.get(id) ?? "custom",
      });
      for (const texture of textures ?? []) {
        const mesh = threadNormalSurface(texture, this.compositor.previewMaterial(), id);
        this.group.add(mesh);
        this.surfaces.push({
          mesh,
          faces: new Set([previewFaceKey(texture.body, texture.face)]),
          id,
          signature,
          definition: this.definitions.get(id) ?? "custom",
        });
      }
      for (const projection of projections ?? []) {
        const mesh = normalProjectionSurface(projection, this.compositor.previewMaterial(), id);
        this.group.add(mesh);
        this.surfaces.push({
          mesh,
          faces: new Set([previewFaceKey(projection.body, projection.face)]),
          id,
          signature,
          definition: this.definitions.get(id) ?? "custom",
        });
      }
    }
    this.style();
    this.editor.world.requestDraw();
  }

  clear(): void {
    if (this.pulseFrame !== null) cancelAnimationFrame(this.pulseFrame);
    this.pulseFrame = null;
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
    (surface.mesh.material as THREE.MeshStandardMaterial).normalMap?.dispose();
    (surface.mesh.material as THREE.Material).dispose();
    if (surface.occluder) {
      this.group.remove(surface.occluder);
      surface.occluder.geometry.dispose();
      (surface.occluder.material as THREE.Material).dispose();
    }
  }

  private style(): PreviewSurface[] {
    const ready = new Set<string>();
    for (const surface of this.surfaces) {
      const mode = effectiveDecoratorDisplay(
        { display: this.displayModes.get(surface.id) },
        decoratorPreviewMode(),
      );
      const drawable =
        surface.mesh.geometry.attributes.position.count >= 3 &&
        (surface.mesh.userData.previewTexture || (surface.mesh.geometry.index?.count ?? 0) >= 3);
      surface.mesh.visible =
        (surface.mesh.userData.previewTexture ? mode === "texture" : mode === "detailed") &&
        drawable &&
        !this.editor.interactions.current?.visualPreview?.replaces?.includes(
          surface.mesh.userData.body,
        ) &&
        this.editor.visibility.visible(surface.mesh.userData.body);
      const appearance = decoratorAppearance(surface.definition, this.colors.get(surface.id));
      (surface.mesh.material as THREE.MeshStandardMaterial).color.set(appearance.color);
      surface.displayOpacity = appearance.opacity;
      surface.clipPlanes = this.clipping.get(surface.id);
      if (surface.mesh.visible) ready.add(`${surface.id}/${surface.mesh.userData.body}`);
    }
    return this.fallback.visible(this.editor, ready);
  }

  private readonly render = (occludeSections?: () => void) => {
    const attached = this.style();
    if (this.group.visible) {
      const surfaces = [...this.surfaces, ...attached];
      this.pulseSelection(surfaces);
      this.compositor.render(
        this.editor.world.renderer,
        this.editor.world.scene,
        this.editor.world.camera,
        surfaces,
        occludeSections,
      );
    }
  };

  private pulseSelection(surfaces: readonly PreviewSurface[]): void {
    const targets = this.editor.modeling.targets;
    const faces = new Set(
      targets
        .filter((target) => target.kind === "face")
        .map((target) => previewFaceKey(target.body, target.face)),
    );
    const bodies = new Set(
      targets.filter((target) => target.kind === "body").map((target) => target.body),
    );
    const offset = 0.05 * Math.sin((performance.now() / 1000) * Math.PI * 2);
    const hsl = { h: 0, s: 0, l: 0 };
    let pulsing = false;
    for (const surface of surfaces) {
      if (
        !surface.mesh.visible ||
        (!bodies.has(surface.mesh.userData.body) &&
          ![...surface.faces].some((face) => faces.has(face)))
      )
        continue;
      // style() restores the configured color each frame, avoiding cumulative drift.
      const color = (surface.mesh.material as THREE.MeshStandardMaterial).color;
      color.getHSL(hsl, THREE.SRGBColorSpace);
      color.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + offset, 0, 1), THREE.SRGBColorSpace);
      pulsing = true;
    }
    if (pulsing && this.pulseFrame === null)
      this.pulseFrame = requestAnimationFrame(() => {
        this.pulseFrame = null;
        // Color animation needs presentation only, not camera/geometry updates.
        this.editor.world.present();
      });
  }

  private readonly foreground = {
    render: this.render,
    hasContent: () => this.group.visible && this.group.children.some((mesh) => mesh.visible),
  };
}
