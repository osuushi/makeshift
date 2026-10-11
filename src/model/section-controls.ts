import * as THREE from "three";
import { emptySketch } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { pick } from "../sketch/picking.js";
import type { PlaneFrame, Point } from "../sketch/planes.js";
import { insideBoundary } from "../sketch/profiles.js";
import { projectedSketch, sameProjectedCurve } from "../sketch/projected-sketch.js";
import { sectionMesh } from "./section-view.js";
import { type SketchSection, sectionProfile } from "./sketch-section.js";

type Region = {
  section: SketchSection;
  profile: NonNullable<ReturnType<typeof sectionProfile>>;
  mesh: ReturnType<typeof sectionMesh>;
};

/** Disposable exact sections of accepted visible bodies; never a second document. */
export class SectionControls {
  private group = new THREE.Group();
  private regions: Region[] = [];
  private key = "";
  private running = false;
  private previousBodies: SketchEditor["store"]["data"]["bodies"] | null = null;
  private previousView = "";
  private disposed = false;
  private hover: Region | undefined;
  private down: { point: Point; region: Region; pointer: number } | null = null;
  private abort = new AbortController();
  constructor(private editor: SketchEditor) {
    editor.world.scene.add(this.group);
    editor.world.changed.add(this.update);
    const options = { capture: true, signal: this.abort.signal };
    const canvas = editor.world.canvas;
    canvas.addEventListener("pointermove", this.move, options);
    canvas.addEventListener("pointerdown", this.start, options);
    canvas.addEventListener("pointerup", this.release, options);
    canvas.addEventListener("pointercancel", this.cancel, options);
    canvas.addEventListener("lostpointercapture", this.cancel, options);
    window.addEventListener("blur", this.cancel, options);
    canvas.addEventListener("pointerleave", () => this.highlight(undefined), options);
    canvas.addEventListener("wheel", () => this.highlight(undefined), options);
    this.update();
  }
  get surfaceCount(): number {
    return this.regions.length;
  }
  get calculating(): boolean {
    return this.running;
  }
  private clear(): void {
    this.highlight(undefined);
    for (const region of this.regions) {
      region.mesh.geometry.dispose();
      region.mesh.material.dispose();
    }
    this.regions = [];
    this.group.clear();
  }
  private update = (): void => {
    const e = this.editor;
    if (!this.eligible() || e.world.cameraMoving) this.highlight(undefined);
    const frame = e.world.activeFrame
      ? (e.sketch?.plane ?? e.world.activeFrame)
      : e.interactions.dragging || e.candidate
        ? null
        : e.world.crossSection;
    const view = JSON.stringify([frame, e.bodiesVisible, e.visibility.key]);
    if (this.previousBodies === e.store.data.bodies && this.previousView === view) return;
    this.previousBodies = e.store.data.bodies;
    this.previousView = view;
    const bodies = e.bodiesVisible
      ? (e.store.data.bodies ?? []).filter((b) => e.visibility.visible(b.id))
      : [];
    const key =
      frame && bodies.length ? JSON.stringify([frame, bodies.map((b) => [b.id, b.brep])]) : "";
    if (key !== this.key) {
      this.key = key;
      this.clear();
      if (key && frame)
        void this.calculate(
          key,
          frame,
          bodies.map((b) => b.id),
        );
    }
  };
  private async calculate(key: string, frame: PlaneFrame, bodies: string[]): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.editor.notice = "Calculating cross sections…";
    try {
      const sections = await this.editor.store.sections(frame, bodies);
      if (this.disposed || key !== this.key) return;
      for (const section of sections) {
        const profile = sectionProfile(section, frame);
        if (!profile) throw new Error("Cross section boundary could not be closed");
        const mesh = sectionMesh(profile, frame, 0.01);
        mesh.visible = false;
        mesh.userData.sectionBody = section.body;
        this.regions.push({ section, profile, mesh });
        this.group.add(mesh);
      }
    } catch (error) {
      if (!this.disposed && key === this.key) {
        this.clear();
        this.editor.message = error instanceof Error ? error.message : "Cross sections unavailable";
      }
    } finally {
      this.running = false;
      if (!this.disposed) {
        if (this.editor.notice === "Calculating cross sections…") this.editor.notice = "";
        if (key !== this.key) {
          this.key = "";
          this.previousBodies = null;
          this.update();
        }
        this.editor.refresh();
      }
    }
  }
  private eligible(): boolean {
    const e = this.editor;
    return (
      !!e.world.activeFrame &&
      e.tool === "select" &&
      !e.blocked &&
      !e.interactions.current &&
      !e.world.cameraTransitioning &&
      !e.placingPivot
    );
  }
  private at(point: Point): Region | undefined {
    const e = this.editor;
    const frame = e.world.activeFrame ? (e.sketch?.plane ?? e.world.activeFrame) : null;
    if (!frame || !this.eligible() || pick(e, point)) return undefined;
    const local = e.world.pointAt(frame, point.x, point.y);
    if (!local) return undefined;
    return this.regions.find(
      (r) =>
        !r.section.curves.every((c) =>
          e.sketch?.curves.some((existing) => sameProjectedCurve(existing, c)),
        ) &&
        insideBoundary(r.profile.outer, local) &&
        !r.profile.holes.some((h) => insideBoundary(h, local)),
    );
  }
  private highlight(region: Region | undefined): void {
    if (this.hover === region) return;
    if (this.hover) this.hover.mesh.visible = false;
    this.hover = region;
    if (region) {
      // Exact regions provide sketch-capture hover; the shared cap pass owns the fill.
      region.mesh.visible = true;
      region.mesh.material.colorWrite = false;
      region.mesh.material.depthWrite = false;
      region.mesh.material.stencilWrite = false;
    }
    this.editor.world.canvas.style.cursor = region ? "pointer" : "";
    this.editor.world.requestDraw();
  }
  private move = (event: PointerEvent): void => {
    if (this.down) {
      event.stopImmediatePropagation();
      return;
    }
    const region = event.buttons ? undefined : this.at({ x: event.clientX, y: event.clientY });
    this.highlight(region);
    if (region) {
      event.stopImmediatePropagation();
      this.editor.hover = null;
      this.editor.pointer = { x: event.clientX, y: event.clientY };
      this.editor.snap = null;
    }
  };
  private start = (event: PointerEvent): void => {
    if (event.button !== 0 || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey)
      return;
    const point = { x: event.clientX, y: event.clientY },
      region = this.at(point);
    if (!region) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.editor.world.canvas.focus();
    this.down = { point, region, pointer: event.pointerId };
    this.editor.world.canvas.setPointerCapture(event.pointerId);
  };
  private cancel = (): void => {
    this.down = null;
    this.highlight(undefined);
  };
  private release = (event: PointerEvent): void => {
    const down = this.down;
    if (!down || down.pointer !== event.pointerId) return;
    this.down = null;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.editor.world.canvas.releasePointerCapture(event.pointerId);
    if (
      Math.hypot(event.clientX - down.point.x, event.clientY - down.point.y) > 4 ||
      this.at({ x: event.clientX, y: event.clientY }) !== down.region
    )
      return;
    void this.add(down.region);
  };
  private async add(region: Region): Promise<void> {
    const e = this.editor,
      frame = e.world.activeFrame;
    if (!frame || !this.eligible()) return;
    const workspace = e.world.workspace;
    await e.numeric.commit();
    if (e.world.workspace !== workspace || !this.regions.includes(region) || !this.eligible())
      return;
    const lease = e.interactions.acquire("use-edge", () => {}, undefined, {
      navigation: "when-released",
    });
    if (!lease) return;
    try {
      const sketch = e.sketch ?? {
        ...emptySketch(frame),
        ...(e.world.workspace?.sketchId ? { id: e.world.workspace.sketchId } : {}),
      };
      const result = projectedSketch(sketch, region.section.curves);
      const previous = new Set(sketch.curves.map((c) => c.id));
      if (await e.editSketch(result, { kind: "direct" }, lease)) {
        if (e.world.workspace) e.world.workspace.sketchId = result.id;
        e.select(result.curves.filter((c) => !previous.has(c.id)).map((c) => c.id));
      }
    } catch (error) {
      e.message = error instanceof Error ? error.message : "Cannot add cross section";
    } finally {
      lease.release();
      e.refresh();
    }
  }
  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.clear();
    this.editor.world.scene.remove(this.group);
  }
}
