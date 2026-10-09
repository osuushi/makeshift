import * as THREE from "three";

export const primitivePreviewLayer = 3;

/** Resolve the opaque preview's own depth before blending it over the model. */
export class PrimitiveOverlay {
  private readonly target = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  private readonly size = new THREE.Vector2();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material = new THREE.MeshBasicMaterial({
    map: this.target.texture,
    transparent: true,
    opacity: 0.5,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);

  constructor() {
    this.scene.add(this.quad);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    let visible = false;
    scene.traverseVisible((object) => {
      if (object.layers.isEnabled(primitivePreviewLayer)) visible = true;
    });
    if (!visible) return;
    renderer.getDrawingBufferSize(this.size);
    if (this.target.width !== this.size.x || this.target.height !== this.size.y) {
      this.target.setSize(this.size.x, this.size.y);
    }
    const background = scene.background;
    const mask = camera.layers.mask;
    const clipping = renderer.clippingPlanes;
    const autoClear = renderer.autoClear;
    const previousTarget = renderer.getRenderTarget();
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    const lights: [THREE.Light, number][] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Light) {
        lights.push([object, object.layers.mask]);
        object.layers.enable(primitivePreviewLayer);
      }
    });
    try {
      scene.background = null;
      camera.layers.set(primitivePreviewLayer);
      renderer.clippingPlanes = [];
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(this.target);
      renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.setRenderTarget(previousTarget);
      renderer.autoClear = false;
      renderer.render(this.scene, this.camera);
    } finally {
      for (const [light, layers] of lights) light.layers.mask = layers;
      scene.background = background;
      camera.layers.mask = mask;
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
