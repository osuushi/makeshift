import * as THREE from "three";
import { fitCameraDepth } from "./camera-depth.js";
import {
  alignCameraToPlane,
  applyCameraPose,
  type CameraFraming,
  type CameraPose,
  planeCameraPose,
} from "./camera-motion.js";
import { levelOrientation, type OrbitPointer, SmoothedTurntable } from "./camera-orbit.js";
import { CameraRoll } from "./camera-roll.js";
import { minimumPlaneBounds, type PlaneBounds } from "./plane-bounds.js";
import {
  type PlaneFrame,
  type PlaneId,
  type Point,
  planes,
  type Vector,
  worldPoint,
} from "./planes.js";
import { sectionClip } from "./view-clipping.js";
import { type ForegroundOverlay, SketchForeground } from "./world-foreground.js";
import { createGrids } from "./world-grid.js";
import { installNavigation } from "./world-navigation.js";

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
  // Keep the last frame intact between event-driven redraws and canvas captures.
  readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    stencil: true,
    preserveDrawingBuffer: true,
  });
  readonly canvas = this.renderer.domElement;
  readonly target = new THREE.Vector3();
  depthBounds = (): THREE.Box3 => new THREE.Box3();
  readonly changed = new Set<() => void>();
  readonly renderOverlays = new Set<() => void>();
  readonly renderForegroundOverlays = new Set<ForegroundOverlay>();
  readonly grids = createGrids(this.scene);
  workspace: { key: string; frame: PlaneFrame; sketchId?: string } | null = null;
  get active(): string | null {
    return this.workspace?.key ?? null;
  }
  get activeFrame(): PlaneFrame | null {
    return this.workspace?.frame ?? null;
  }
  crossSection: PlaneFrame | null = null;
  height = 80;
  spacing = 1;
  canNavigate = () => true;
  transformBoxContains: ((x: number, y: number) => boolean) | null = null;
  canEnterSketch = () => true;
  planePicker: ((id: PlaneId) => void) | null = null;
  planePickerAccept: ((frame: PlaneFrame) => boolean) | null = null;
  planeBounds: (frame: PlaneFrame) => PlaneBounds = minimumPlaneBounds;
  longPress: ((event: PointerEvent) => void) | null = null;
  planePickerLabel = "Project onto";
  sketchEntry: ((id: PlaneId) => void) | null = null;
  planeSelection: ((id: PlaneId) => void) | null = null;
  selectedPlane: PlaneId | null = null;
  private readonly observer: ResizeObserver;
  private readonly removeNavigation: () => void;
  private cameraAnimation: number | null = null;
  private pendingDraw: number | null = null;
  private readonly foreground = new SketchForeground();
  private readonly sketchClip = new THREE.Plane();
  readonly rollAnimation = new CameraRoll(this);
  readonly orbit = new SmoothedTurntable();
  orbitPivot: (press: Point) => THREE.Vector3 = () => this.target.clone();
  rollPivot: () => THREE.Vector3 | null = () => null;
  private rotationPivot = new THREE.Vector3();
  get currentOrbitPivot(): THREE.Vector3 {
    return this.rotationPivot.clone();
  }
  beginOrbit(pointer: OrbitPointer, press: Point, roll = false): void {
    this.cancelCameraMotion();
    this.rotationPivot.copy(this.orbitPivot(press));
    const rollPivot = this.rollPivot();
    if (this.active) this.exit();
    this.orbit.begin(this, pointer, this.rotationPivot, roll, rollPivot);
  }
  get cameraTransitioning(): boolean {
    return this.cameraAnimation !== null || this.rollAnimation.active;
  }
  get cameraMoving(): boolean {
    return this.cameraTransitioning || this.pendingDraw !== null;
  }

  constructor(
    readonly host: HTMLElement,
    readonly overlay: HTMLElement,
  ) {
    this.scene.background = new THREE.Color("#f8f9fb");
    this.camera.position.set(55, -70, 65);
    this.camera.up.set(0, 0, 1);
    this.canvas.setAttribute("aria-label", "Modeling viewport");
    this.canvas.tabIndex = 0;
    host.append(this.canvas);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(host);
    this.removeNavigation = installNavigation(this);
    this.draw();
  }
  draw(): void {
    if (this.pendingDraw !== null) cancelAnimationFrame(this.pendingDraw);
    this.pendingDraw = null;
    const width = this.host.clientWidth;
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    const half = this.height / 2;
    this.camera.left = (-half * width) / height;
    this.camera.right = (half * width) / height;
    this.camera.top = half;
    this.camera.bottom = -half;
    fitCameraDepth(this.camera, this.target, this.height, this.depthBounds());
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.spacing = this.grids.update(
      this.camera,
      this.target,
      this.height,
      this.activeFrame,
      height,
    );
    this.updateClipping();
    for (const listener of this.changed) listener();
    this.renderer.render(this.scene, this.camera);
    for (const render of this.renderOverlays) render();
    if (this.activeFrame) {
      this.foreground.render(
        this.renderer,
        this.scene,
        this.camera,
        this.sketchClip,
        this.renderForegroundOverlays,
      );
    }
  }
  private updateClipping(): void {
    const frame = this.activeFrame;
    if (!frame) {
      this.renderer.clippingPlanes = this.crossSection ? [sectionClip(this.crossSection)] : [];
      if (this.renderer.clippingPlanes[0]) this.renderer.clippingPlanes[0].constant += 1e-4;
      return;
    }
    const normal = new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v)).normalize();
    const origin = new THREE.Vector3(...frame.origin);
    if (normal.dot(this.camera.position.clone().sub(origin)) > 0) normal.negate();
    this.sketchClip.setFromNormalAndCoplanarPoint(normal, origin);
    // Retain coplanar curves and faces despite floating-point projection noise.
    this.sketchClip.constant += 1e-4;
    this.renderer.clippingPlanes = [this.sketchClip];
  }
  visiblePoint(point: THREE.Vector3): boolean {
    return this.renderer.clippingPlanes.every((plane) => plane.distanceToPoint(point) >= 0);
  }
  requestDraw(): void {
    // Subsequent input events need the latest basis and picking depth before the next paint.
    fitCameraDepth(this.camera, this.target, this.height, this.depthBounds());
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    if (this.pendingDraw !== null) return;
    this.pendingDraw = requestAnimationFrame(() => this.draw());
  }
  enter(id: PlaneId): void {
    this.enterWorkspace({ key: id, frame: planes[id] });
  }
  enterWorkspace(
    workspace: { key: string; frame: PlaneFrame; sketchId?: string },
    framing: CameraFraming = {},
  ): void {
    this.workspace = workspace;
    this.animateTo(workspace.frame, framing);
  }
  syncWorkspaceFrame(frame: PlaneFrame): void {
    if (!this.workspace || JSON.stringify(this.workspace.frame) === JSON.stringify(frame)) return;
    this.workspace = { ...this.workspace, frame };
    this.cancelCameraMotion();
    alignCameraToPlane(this, frame);
  }
  private animateTo(frame: PlaneFrame, framing: CameraFraming): void {
    this.animatePose(planeCameraPose(this, frame, framing));
  }
  animateOrientation(quaternion: THREE.Quaternion): void {
    this.animatePose({
      target: this.target.clone(),
      quaternion,
      distance: this.camera.position.distanceTo(this.target),
      height: this.height,
    });
  }
  private animatePose(end: CameraPose): void {
    this.cancelCameraMotion();
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    const start = {
      target: this.target.clone(),
      quaternion: this.camera.quaternion.clone(),
      distance: this.camera.position.distanceTo(this.target),
      height: this.height,
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      applyCameraPose(this, end);
      this.draw();
      return;
    }
    const started = performance.now();
    this.cameraAnimation = requestAnimationFrame((now) =>
      this.cameraStep(start, end, started, now),
    );
    this.draw();
  }
  levelHorizon(): void {
    if (this.rollAnimation.active) return;
    this.animateOrientation(levelOrientation(this));
  }
  private cameraStep(
    start: ReturnType<typeof planeCameraPose>,
    end: ReturnType<typeof planeCameraPose>,
    started: number,
    now: number,
  ): void {
    const progress = Math.min(1, (now - started) / 280),
      amount = 1 - (1 - progress) ** 3;
    applyCameraPose(this, {
      target: start.target.clone().lerp(end.target, amount),
      quaternion: start.quaternion.clone().slerp(end.quaternion, amount),
      distance: THREE.MathUtils.lerp(start.distance, end.distance, amount),
      height: THREE.MathUtils.lerp(start.height, end.height, amount),
    });
    this.cameraAnimation =
      progress < 1
        ? requestAnimationFrame((next) => this.cameraStep(start, end, started, next))
        : null;
    this.draw();
  }
  cancelCameraMotion(preserveRoll = false): void {
    if (!preserveRoll) this.rollAnimation.cancel();
    if (this.cameraAnimation === null) return;
    cancelAnimationFrame(this.cameraAnimation);
    this.cameraAnimation = null;
  }

  axisName(axis: "x" | "y"): string {
    const key = this.active;
    return key && key in planes ? key[axis === "x" ? 0 : 1] : axis.toUpperCase();
  }
  exit(): void {
    this.cancelCameraMotion();
    this.workspace = null;
    this.draw();
  }
  project(point: Vector): Point {
    const projected = new THREE.Vector3(...point).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((projected.x + 1) * rect.width) / 2,
      y: rect.top + ((1 - projected.y) * rect.height) / 2,
    };
  }
  projectLocal(frame: PlaneFrame, point: Point): Point {
    return this.project(worldPoint(frame, point));
  }
  pointAt(frame: PlaneFrame, x: number, y: number): Point | null {
    const rect = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((x - rect.left) / rect.width) * 2 - 1,
        1 - ((y - rect.top) / rect.height) * 2,
      ),
      this.camera,
    );
    const u = new THREE.Vector3(...frame.u),
      v = new THREE.Vector3(...frame.v);
    const origin = new THREE.Vector3(...frame.origin);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(u.clone().cross(v), origin);
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) return null;
    hit.sub(origin);
    return { x: hit.dot(u), y: hit.dot(v) };
  }
  dispose(): void {
    this.cancelCameraMotion();
    if (this.pendingDraw !== null) cancelAnimationFrame(this.pendingDraw);
    this.observer.disconnect();
    this.removeNavigation();
    this.grids.dispose();
    this.foreground.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    this.changed.clear();
  }
}
