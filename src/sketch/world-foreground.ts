import * as THREE from "three";

// Body surfaces, edges and their lights participate in this additional pass.
export const foregroundBodyLayer = 1;

export interface ForegroundOverlay {
  render(): void;
  hasContent(): boolean;
}

export function hasForegroundContent(
  scene: THREE.Object3D,
  overlays: ReadonlySet<ForegroundOverlay>,
): boolean {
  if ([...overlays].some((overlay) => overlay.hasContent())) return true;
  let geometry = false;
  scene.traverseVisible((object) => {
    if (!object.layers.isEnabled(foregroundBodyLayer)) return;
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points ||
      object instanceof THREE.Sprite
    )
      geometry = true;
  });
  return geometry;
}

export class SketchForeground {
  private readonly target = new THREE.WebGLRenderTarget(1, 1, {
    samples: 4,
    stencilBuffer: true,
  });
  private readonly plane = new THREE.Plane();
  private readonly size = new THREE.Vector2();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material = new THREE.MeshBasicMaterial({
    map: this.target.texture,
    transparent: true,
    opacity: 0.2,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);

  constructor() {
    this.scene.add(this.quad);
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    sketchClip: THREE.Plane,
    overlays: ReadonlySet<ForegroundOverlay>,
  ): void {
    // Lights and empty body groups do not need a full-screen MSAA/compositing pass.
    if (!hasForegroundContent(scene, overlays)) return;
    renderer.getDrawingBufferSize(this.size);
    this.target.setSize(this.size.x, this.size.y);
    // Complement the main cut exactly, leaving its coplanar tolerance intact.
    this.plane.copy(sketchClip).negate();
    const background = scene.background;
    const layers = camera.layers.mask;
    const clipping = renderer.clippingPlanes;
    const autoClear = renderer.autoClear;
    const previousTarget = renderer.getRenderTarget();
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    try {
      scene.background = null;
      camera.layers.set(foregroundBodyLayer);
      renderer.clippingPlanes = [this.plane];
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(this.target);
      renderer.autoClear = true;
      renderer.render(scene, camera);
      for (const overlay of overlays) overlay.render();
      renderer.setRenderTarget(previousTarget);
      renderer.clippingPlanes = [];
      renderer.autoClear = false;
      renderer.render(this.scene, this.camera);
    } finally {
      scene.background = background;
      camera.layers.mask = layers;
      renderer.clippingPlanes = clipping;
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(clearColor, clearAlpha);
    }
  }

  dispose(): void {
    this.target.dispose();
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
