import * as THREE from "three";
import { stableClipping } from "../sketch/stable-clipping.js";

export const decoratorPreviewLayer = 2;
export interface PreviewSurface {
  mesh: THREE.Mesh;
  faces: ReadonlySet<string>;
  opacity?: number;
  displayOpacity?: number;
}
export const previewFaceKey = (body: string, face: string) => `${body}/${face}`;

/** Ignore only a preview's own supports; resolve all opaque previews before blending once. */
export class DecoratorPreviewCompositor {
  private readonly size = new THREE.Vector2();
  private readonly depth = new THREE.DepthTexture(1, 1, THREE.UnsignedInt248Type);
  private readonly occlusion = new THREE.WebGLRenderTarget(1, 1, {
    depthTexture: this.depth,
    stencilBuffer: true,
  });
  private readonly previews = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material = new THREE.MeshBasicMaterial({
    map: this.previews.texture,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);

  constructor() {
    this.scene.add(this.quad);
    this.depth.format = THREE.DepthStencilFormat;
  }

  previewMaterial(): THREE.MeshStandardMaterial {
    const material = stableClipping(
      new THREE.MeshStandardMaterial({
        color: "#258c96",
        roughness: 0.6,
        metalness: 0.08,
        side: THREE.DoubleSide,
        transparent: true,
        blending: THREE.NoBlending,
      }),
    );
    const clip = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      clip.call(material, shader, renderer);
      shader.uniforms.decoratorOcclusion = { value: this.occlusion.depthTexture };
      shader.uniforms.decoratorResolution = { value: this.size };
      shader.fragmentShader = `uniform sampler2D decoratorOcclusion;
uniform vec2 decoratorResolution;\n${shader.fragmentShader}`.replace(
        "#include <alphatest_fragment>",
        `#include <alphatest_fragment>
if (gl_FragCoord.z > texture2D(decoratorOcclusion, gl_FragCoord.xy / decoratorResolution).r + 0.0000001) discard;`,
      );
    };
    material.customProgramCacheKey = () => "decorator-occlusion-stable-clip";
    return material;
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    surfaces: readonly PreviewSurface[],
  ): void {
    const visible = surfaces.filter(({ mesh }) => mesh.visible);
    if (!visible.length) return;
    renderer.getDrawingBufferSize(this.size);
    this.occlusion.setSize(this.size.x, this.size.y);
    this.previews.setSize(this.size.x, this.size.y);
    const background = scene.background,
      layers = camera.layers.mask;
    const target = renderer.getRenderTarget(),
      autoClear = renderer.autoClear;
    const clipping = renderer.clippingPlanes;
    const color = renderer.getClearColor(new THREE.Color()),
      alpha = renderer.getClearAlpha();
    const supports: THREE.Object3D[] = [];
    scene.traverseVisible((object) => {
      if (typeof object.userData.decoratorFace === "string") supports.push(object);
    });
    try {
      scene.background = null;
      renderer.setClearColor(0, 0);
      renderer.setRenderTarget(this.previews);
      renderer.clear();
      for (const { mesh } of visible) mesh.visible = false;
      for (const surface of visible) {
        (surface.mesh.material as THREE.Material).opacity =
          (surface.opacity ?? 1) * (surface.displayOpacity ?? 0.78);
        this.renderSurface(renderer, scene, camera, surface, supports, layers);
      }
      renderer.setRenderTarget(target);
      renderer.clippingPlanes = [];
      renderer.autoClear = false;
      renderer.render(this.scene, this.camera);
    } finally {
      for (const { mesh } of visible) mesh.visible = true;
      scene.background = background;
      camera.layers.mask = layers;
      renderer.clippingPlanes = clipping;
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(target);
      renderer.setClearColor(color, alpha);
    }
  }

  private renderSurface(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    surface: PreviewSurface,
    supports: THREE.Object3D[],
    layers: number,
  ): void {
    const hidden = supports.filter((object) => surface.faces.has(object.userData.decoratorFace));
    try {
      for (const object of hidden) object.visible = false;
      camera.layers.mask = layers;
      renderer.setRenderTarget(this.occlusion);
      renderer.autoClear = true;
      renderer.render(scene, camera);
    } finally {
      for (const object of hidden) object.visible = true;
    }
    try {
      surface.mesh.visible = true;
      camera.layers.set(decoratorPreviewLayer);
      renderer.setRenderTarget(this.previews);
      renderer.autoClear = false;
      renderer.render(scene, camera);
    } finally {
      surface.mesh.visible = false;
    }
  }

  dispose(): void {
    this.occlusion.dispose();
    this.previews.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
