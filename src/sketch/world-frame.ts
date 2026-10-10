import type * as THREE from "three";
import { GridOcclusion } from "./grid-occlusion.js";
import type { World } from "./world.js";
import { SketchForeground } from "./world-foreground.js";
import { PrimitiveOverlay } from "./world-primitive-overlay.js";

declare global {
  interface Window {
    makeshiftTestFrameMode?: "on-demand";
  }
}

/** GPU presentation; camera, geometry, picking and DOM updates remain in World. */
export class WorldFrame {
  private readonly gridOcclusion = new GridOcclusion();
  private readonly foreground = new SketchForeground();
  private readonly primitives = new PrimitiveOverlay();
  private width = -1;
  private height = -1;

  constructor(
    private readonly world: World,
    private readonly capture: () => void,
  ) {
    window.addEventListener("makeshift-test-frame", this.captureFrame);
  }

  private readonly captureFrame = (): void => {
    if (window.makeshiftTestFrameMode === "on-demand") this.capture();
  };

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.world.renderer.setSize(width, height, false);
    this.width = width;
    this.height = height;
  }

  render(clip: THREE.Plane, force: boolean): void {
    if (window.makeshiftTestFrameMode === "on-demand" && !force) return;
    const { renderer, scene, camera, renderOverlays, renderForegroundOverlays, activeFrame } =
      this.world;
    this.gridOcclusion.update(this.world);
    renderer.render(scene, camera);
    for (const render of renderOverlays) render();
    if (activeFrame) {
      this.foreground.render(renderer, scene, camera, clip, renderForegroundOverlays);
    }
    this.primitives.render(renderer, scene, camera);
  }

  dispose(): void {
    window.removeEventListener("makeshift-test-frame", this.captureFrame);
    this.foreground.dispose();
    this.primitives.dispose();
  }
}
