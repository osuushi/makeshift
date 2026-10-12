import type * as THREE from "three";
import { SectionCaps } from "../model/section-caps.js";
import { viewDisplay } from "../preferences/view-display.js";
import { GridOcclusion } from "./grid-occlusion.js";
import type { Point } from "./planes.js";
import type { World } from "./world.js";
import { SketchForeground } from "./world-foreground.js";
import { PrimitiveOverlay } from "./world-primitive-overlay.js";
import { XrayComposite } from "./xray-composite.js";

declare global {
  interface Window {
    makeshiftTestFrameMode?: "on-demand";
  }
}

/** GPU presentation; camera, geometry, picking and DOM updates remain in World. */
export class WorldFrame {
  private readonly gridOcclusion = new GridOcclusion();
  private readonly sections = new SectionCaps();
  private readonly foreground = new SketchForeground();
  private readonly primitives = new PrimitiveOverlay();
  private readonly xray = new XrayComposite();
  private width = -1;
  private height = -1;

  constructor(
    private readonly world: World,
    private readonly capture: () => void,
  ) {
    window.addEventListener("makeshift-test-frame", this.captureFrame);
    world.canvas.addEventListener("webglcontextrestored", this.restoreXray);
  }

  private readonly restoreXray = (): void => this.xray.invalidate();

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
    this.gridOcclusion.update(this.world);
    if (this.xray.enabled(this.world))
      this.xray.render(
        this.world,
        () => this.normal(),
        () => this.section(clip),
      );
    else this.section(clip);
    const { renderer, scene, camera } = this.world;
    this.primitives.render(renderer, scene, camera);
  }

  sectionEnabled(point: Point): boolean {
    return this.xray.contains(this.world, point);
  }

  private normal(): void {
    const { renderer, scene, camera, renderOverlays } = this.world;
    renderer.render(scene, camera);
    for (const render of renderOverlays) render();
  }

  private section(clip: THREE.Plane): void {
    const { renderer, scene, camera, renderOverlays, renderForegroundOverlays, partialSection } =
      this.world;
    renderer.render(scene, camera);
    this.sections.render(this.world);
    for (const render of renderOverlays) render();
    if (partialSection) {
      this.foreground.render(
        renderer,
        scene,
        camera,
        clip,
        renderForegroundOverlays,
        viewDisplay().sectionFrontOpacity,
      );
    }
  }

  dispose(): void {
    window.removeEventListener("makeshift-test-frame", this.captureFrame);
    this.world.canvas.removeEventListener("webglcontextrestored", this.restoreXray);
    this.foreground.dispose();
    this.sections.dispose();
    this.primitives.dispose();
    this.xray.dispose();
  }
}
