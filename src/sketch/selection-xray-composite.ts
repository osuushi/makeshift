import type * as THREE from "three";
import { previewFaceKey } from "../decorators/preview-compositor.js";
import { enableVisualSelectionXray } from "../model/visual-selection-xray.js";
import { viewDisplay } from "../preferences/view-display.js";
import { type BodyMaskSource, BodyXrayMask } from "./body-xray-mask.js";
import type { World } from "./world.js";
import { XrayComposite } from "./xray-composite.js";

/** Reveal selected topology and its depth-sorted surroundings through one faded shell. */
export class SelectionXrayComposite {
  private readonly mask = new BodyXrayMask((world) => {
    const masks = world.selectionXray()?.masks ?? [];
    const sources: BodyMaskSource[] = [];
    world.scene.traverseVisible((object) => {
      for (const mask of masks)
        if (mask.body === object.userData.bodyMaskId)
          sources.push({ object, geometry: mask.geometry });
    });
    return sources;
  });
  private readonly composite = new XrayComposite(this.mask);

  render(world: World, render: () => void): void {
    const reveal = world.selectionXray();
    if (!reveal) {
      render();
      return;
    }
    const hidden: THREE.Object3D[] = [];
    const previews: THREE.Object3D[] = [];
    world.scene.traverseVisible((object) => {
      if (object.userData.selectionXrayParts) previews.push(object);
      const face = object.userData.bodyFace,
        edge = object.userData.bodyEdge;
      if (
        (face && reveal.faces.has(previewFaceKey(face.body, face.face))) ||
        (edge && reveal.edges.has(previewFaceKey(edge.body, edge.edge)))
      )
        hidden.push(object);
    });
    if (!hidden.length && !previews.length) {
      render();
      return;
    }
    this.composite.render(
      world,
      render,
      () => {
        const previous = world.scene.userData.xrayHiddenFaces;
        const restore: (() => void)[] = [];
        try {
          world.scene.userData.xrayHiddenFaces = reveal.faces;
          for (const object of hidden) object.visible = false;
          for (const object of previews) {
            const reset = enableVisualSelectionXray(object, reveal);
            if (reset) restore.push(reset);
          }
          render();
        } finally {
          world.scene.userData.xrayHiddenFaces = previous;
          for (const object of hidden) object.visible = true;
          for (const reset of restore) reset();
        }
      },
      "selection",
    );
  }

  contains(world: World, point: { x: number; y: number }): boolean {
    // The feather retains ordinary picking, just like the sketch aperture.
    return !!world.selectionXray() && this.mask.contains(world, point, viewDisplay().xrayBleed);
  }
  invalidate(): void {
    this.composite.invalidate();
  }
  dispose(): void {
    this.composite.dispose();
  }
}
